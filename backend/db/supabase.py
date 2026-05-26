"""
backend/db/supabase.py

Fixes vs original:
  Bug 1 — get_cached_company: now also checks analysis_jobs for completed jobs,
           so repeat queries return cached results instead of spawning new AI jobs.
  Bug 2 — _cache_to_job: uses cached.get("evidence") OR cached.get("sources")
           so local_cache.json URL lists are preserved for the evidence panel.
  Bug 3 — _cache_to_job: analysis_flags now includes severity from cached data.
"""

import os
import json
from pathlib import Path
from supabase import create_client

# ─── Local cache (read fallback when Supabase is unavailable) ─────────────────

_CACHE_PATH = Path(__file__).parent.parent.parent / "analysis" / "local_cache.json"

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


def _cache_to_job(company_name: str, cached: dict) -> dict:
    """
    Shape a local cache entry into the same structure as a Supabase job record
    so the frontend normaliser receives a consistent object.

    Fixes:
      - evidence: falls back to "sources" (URL list) if "evidence" key absent
      - analysis_flags: now includes severity from cached data
    """
    dim = cached.get("dimension_scores") or cached.get("dimensionScores") or {}

    # Bug 2 fix: local_cache.json uses "sources" (list of URL strings) not "evidence"
    evidence = cached.get("evidence") or cached.get("sources") or []

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
                # Bug 3 fix: preserve severity from cached data
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
    """
    Write a new job record to Supabase.
    Failure is logged but not raised — the job still runs in the analysis service.
    """
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
    """
    Read a job record from Supabase including its flags.
    Returns None on DB failure — caller handles the missing job case.
    """
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

    Fallback chain (Bug 1 fix — three layers instead of two):
      1. Supabase cached_companies table  (explicit cache entries)
      2. Supabase analysis_jobs table     (any completed job for this company)
      3. local_cache.json                 (pre-computed demo companies)

    Layer 2 is the critical addition: without it, every repeat query for a
    real company created a new AI job because cached_companies was never written.
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

        # ── Layer 2: any completed job for this company name ───────────────
        # This is the fix for Bug 1: repeat queries reuse the existing result
        # instead of spawning a new AI analysis job every time.
        try:
            res = (
                db.table("analysis_jobs")
                .select("id, company_name")
                .eq("company_name", company_name)
                .eq("status", "completed")
                .order("completed_at", desc=True)
                .limit(1)
                .maybe_single()
                .execute()
            )
            if res.data:
                print(f"Cache hit (analysis_jobs completed): {company_name} → {res.data['id']}")
                return {"job_id": res.data["id"], "company_name": company_name}
        except Exception as e:
            print(f"analysis_jobs cache lookup failed: {e}")

    # ── Layer 3: local_cache.json (zero-network, pre-computed) ────────────
    cached = _cache_lookup(company_name)
    if cached:
        print(f"Cache hit (local_cache.json): {company_name}")
        return {"job_id": f"local:{company_name}", "company_name": company_name}

    return None


def get_job_with_local_fallback(job_id: str, company_name: str) -> dict | None:
    """
    Called by the route handler when job_id starts with "local:" — i.e. the
    result came from local_cache.json rather than Supabase.
    """
    cached = _cache_lookup(company_name)
    if cached:
        return _cache_to_job(company_name, cached)
    return None


def get_history() -> list[dict]:
    """
    Return recent completed analyses.
    Returns [] on DB failure — frontend shows an empty history gracefully.
    """
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
        return res.data or []
    except Exception as e:
        print(f"get_history failed: {e}")
        return []
