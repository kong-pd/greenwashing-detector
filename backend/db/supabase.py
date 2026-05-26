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
    """
    dim = cached.get("dimension_scores") or cached.get("dimensionScores") or {}
    return {
        "id":           f"cached-{company_name[:8].lower().replace(' ', '-')}",
        "company_name": company_name,
        "status":       "completed",
        "step":         None,
        "fail_reason":  None,
        "score":        cached.get("score"),
        "risk_level":   cached.get("risk_level") or cached.get("riskLevel"),
        "summary":      cached.get("summary"),
        "sources":      cached.get("evidence") or [],
        "created_at":   None,
        "completed_at": None,
        "dimension_scores": dim,
        "analysis_flags": [
            {
                "job_id":      None,
                "type":        f.get("type"),
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
    Look up a cached company result.

    Fallback chain:
      1. Supabase cached_companies table
      2. local_cache.json (when Supabase is unavailable)
    """
    # Try Supabase first
    try:
        res = (
            get_client()
            .table("cached_companies")
            .select("*")
            .eq("company_name", company_name)
            .maybe_single()
            .execute()
        )
        if res.data:
            return res.data
    except Exception as e:
        print(f"get_cached_company Supabase failed: {e} — falling back to local cache")

    # Fall back to local cache
    cached = _cache_lookup(company_name)
    if cached:
        print(f"Serving '{company_name}' from local cache (Supabase unavailable)")
        # Return a synthetic cached_companies record pointing to the local result
        # The job_id is synthetic; the route handler uses it to call get_job
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
