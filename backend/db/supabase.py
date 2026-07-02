"""
backend/db/supabase.py
"""

import os
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from supabase import create_client

# ─── Cache TTL ────────────────────────────────────────────────────────────────
# Completed jobs are reused as cache hits only if completed within this window.
# Tune CACHE_TTL_HOURS per environment: short windows (e.g. 48) suit live
# showcases; production can raise it to 168 (1 week) or align with disclosure cycles.

_CACHE_TTL_HOURS = int(os.environ.get("CACHE_TTL_HOURS", "24"))


# ─── Local cache (read fallback when Supabase is unavailable) ─────────────────

_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "analysis" / "local_cache.json"

def _load_local_cache() -> dict:
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

_LOCAL_CACHE = _load_local_cache()


def _cache_lookup(company_name: str) -> dict | None:
    """Case-insensitive partial match against local_cache.json."""
    key = company_name.strip().lower()
    if key in _LOCAL_CACHE:
        return _LOCAL_CACHE[key]
    for cache_key, result in _LOCAL_CACHE.items():
        if cache_key in key or key in cache_key:
            return result
    return None


def coerce_evidence_objects(evidence) -> list[dict]:
    """
    Canonical evidence normaliser — the single place where legacy string-array
    evidence is converted into minimal evidence objects.

    Guarantees the rest of the system (report normaliser, PDF generator,
    frontend) only ever sees dict-shaped evidence. Items that are already
    objects pass through untouched, preserving any extra fields
    (reliability / recency / relevance weight components).
    """
    if not isinstance(evidence, list):
        return []
    out = []
    for i, item in enumerate(evidence):
        if isinstance(item, dict):
            out.append(item)
        elif isinstance(item, str):
            is_url = item.startswith("http")
            out.append({
                "id":     f"E-{i+1:02d}",
                "kind":   "News",
                "title":  item,
                "org":    "",
                "date":   "",
                "url":    item if is_url else "",
                "quote":  "",
                "weight": 0.5,
            })
    return out


def _cache_to_job(company_name: str, cached: dict) -> dict:
    """
    Shape a local cache entry into the same structure as a Supabase job record.

    Evidence is coerced to object form here (P0 fix): when Supabase is down and
    a request is served from local_cache.json, both /report and /pdf consume
    this record directly — a legacy string-array `sources` field would
    otherwise reach the PDF generator and the frontend as bare strings.
    """
    dim = cached.get("dimension_scores") or cached.get("dimensionScores") or {}
    evidence = coerce_evidence_objects(
        cached.get("evidence") or cached.get("sources") or []
    )

    return {
        "id":           f"cached-{company_name[:8].lower().replace(' ', '-')}",
        "company_name": company_name,
        "status":       "completed",
        "step":         None,
        "fail_reason":  None,
        "score":        cached.get("score"),
        "risk_level":   cached.get("risk_level") or cached.get("riskLevel"),
        "summary":      cached.get("summary"),
        "sources":      evidence,
        "created_at":   None,
        "completed_at": None,
        "dimension_scores": dim,
        "analysis_flags": [
            {
                "job_id":      None,
                "type":        f.get("type"),
                "severity":    f.get("severity", "medium"),
                "description": f.get("description"),
                "source":      f.get("source", ""),
            }
            for f in (cached.get("flags") or [])
        ],
    }


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def get_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])


def create_job(job_id: str, company_name: str):
    try:
        get_client().table("analysis_jobs").insert({
            "id":           job_id,
            "company_name": company_name,
            "status":       "processing",
            "step":         "Initializing...",
        }).execute()
    except Exception as e:
        print(f"create_job DB write failed (non-critical): {e}")


def get_job(job_id: str) -> dict | None:
    try:
        res = (
            get_client()
            .table("analysis_jobs")
            .select("*, analysis_flags(*)")
            .eq("id", job_id)
            .single()
            .execute()
        )
        return res.data
    except Exception as e:
        print(f"get_job failed for {job_id}: {e}")
        return None


def get_cached_company(company_name: str) -> dict | None:
    """
    Look up a previously completed analysis for this company name.

    Fallback chain (three layers):
      1. Supabase cached_companies table  (explicit permanent cache entries)
      2. Supabase analysis_jobs table     (any completed job within TTL window)
         — TTL controlled by CACHE_TTL_HOURS env var (default 24h)
         — Prevents serving stale results while still saving API tokens
      3. local_cache.json                 (pre-computed demo companies; no TTL)
    """
    db = None
    try:
        db = get_client()
    except Exception as e:
        print(f"Supabase client init failed: {e} — falling back to local cache")

    if db is not None:
        # ── Layer 1: explicit cached_companies entry ───────────────────────
        try:
            res = (
                db.table("cached_companies")
                .select("*")
                .eq("company_name", company_name)
                .maybe_single()
                .execute()
            )
            if res.data:
                print(f"Cache hit (cached_companies): {company_name}")
                return res.data
        except Exception as e:
            print(f"cached_companies lookup failed: {e}")

        # ── Layer 2: completed jobs within TTL window ──────────────────────
        # Only reuse results completed within the last CACHE_TTL_HOURS hours.
        # This balances token saving against information freshness.
        try:
            cutoff = (
                datetime.now(timezone.utc) - timedelta(hours=_CACHE_TTL_HOURS)
            ).isoformat()

            res = (
                db.table("analysis_jobs")
                .select("id, company_name")
                .eq("company_name", company_name)
                .eq("status", "completed")
                .gte("completed_at", cutoff)
                .order("completed_at", desc=True)
                .limit(1)
                .maybe_single()
                .execute()
            )
            if res.data:
                print(f"Cache hit (analysis_jobs, TTL={_CACHE_TTL_HOURS}h): "
                      f"{company_name} → {res.data['id']}")
                return {"job_id": res.data["id"], "company_name": company_name}
        except Exception as e:
            print(f"analysis_jobs cache lookup failed: {e}")

    # ── Layer 3: local_cache.json (zero-network, no TTL — always fresh enough) ──
    cached = _cache_lookup(company_name)
    if cached:
        print(f"Cache hit (local_cache.json): {company_name}")
        return {"job_id": f"local:{company_name}", "company_name": company_name}

    return None


def get_job_with_local_fallback(job_id: str, company_name: str) -> dict | None:
    cached = _cache_lookup(company_name)
    if cached:
        return _cache_to_job(company_name, cached)
    return None


def history_row(row: dict) -> dict:
    """Public shape for one history entry.

    The API speaks `job_id` everywhere (POST /analyze response, GET
    /report/{job_id}) — the raw DB column `id` never leaves this layer.
    Regression guard for audit C-2, where the UI read job_id while the
    endpoint sent id and every Reports row rendered 'undefined'.
    """
    return {
        "job_id":       row.get("id"),
        "company_name": row.get("company_name"),
        "score":        row.get("score"),
        "risk_level":   row.get("risk_level"),
        "completed_at": row.get("completed_at"),
    }


def get_history() -> list[dict]:
    try:
        res = (
            get_client()
            .table("analysis_jobs")
            .select("id, company_name, score, risk_level, completed_at")
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(10)
            .execute()
        )
        return [history_row(r) for r in (res.data or [])]
    except Exception as e:
        print(f"get_history failed: {e}")
        return []
