import uuid
import httpx
import os
from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, model_validator
from db.supabase import (
    get_job, create_job, get_history,
    get_cached_company, get_job_with_local_fallback,
    coerce_evidence_objects,
)
from pdf.generator import generate_pdf

router = APIRouter()


class AnalyzeRequest(BaseModel):
    company_name:   str | None = None
    query:          str | None = None     # frontend field alias
    claimId:        str | None = None     # frontend field (ignored)
    manual_content: str | None = None

    @model_validator(mode="after")
    def resolve_company_name(self):
        if not self.company_name and self.query:
            self.company_name = self.query
        return self


# ─── Response normaliser ──────────────────────────────────────────────────────

def _normalise_job(job: dict) -> dict:
    """
    Transform a Supabase job record (or local cache record) into the shape
    the frontend expects, with both snake_case and camelCase keys.
    """
    if not job:
        return job

    flags = job.get("analysis_flags") or []
    normalised_flags = []
    for f in flags:
        ftype = f.get("type", "")
        severity = f.get("severity") or (
            "high"   if ftype in ("Data Contradiction", "Negative News") else
            "medium" if ftype in ("Vague Claims", "Lack of Certification") else
            "low"
        )
        normalised_flags.append({
            "type":        ftype,
            "severity":    severity,
            "description": f.get("description", ""),
            "source":      f.get("source", ""),
        })

    # Evidence is stored in the sources JSONB field as a list of evidence objects.
    # coerce_evidence_objects handles legacy string arrays and passes object
    # entries through untouched — including the M5 weight-component fields
    # (reliability / recency / relevance), which must reach the frontend intact.
    evidence = coerce_evidence_objects(job.get("sources") or [])

    dim = job.get("dimension_scores") or {}

    return {
        # Identity
        "job_id":      job.get("id"),
        "id":          job.get("id"),
        "status":      job.get("status"),
        "step":        job.get("step"),
        "fail_reason": job.get("fail_reason"),
        # Company
        "company_name": job.get("company_name"),
        "headline":     job.get("company_name"),
        "shortQuote":   "",
        "source":       "GreenCheck analysis",
        "sourceType":   "AI Analysis",
        "capturedAt":   (job.get("created_at") or "")[:10],
        "analyzedAt":   job.get("completed_at") or "",
        # Scoring
        "score":      job.get("score"),
        "risk_level": job.get("risk_level"),
        "riskLevel":  job.get("risk_level"),
        "confidence": job.get("confidence"),
        "summary":    job.get("summary", ""),
        "dimension_scores": dim,
        "dimensionScores": {
            "specificity":               dim.get("specificity", 0),
            "data_consistency":          dim.get("data_consistency", 0),
            "third_party_certification": dim.get("third_party_certification", 0),
            "negative_news":             dim.get("negative_news", 0),
            "greenwashing_language":     dim.get("greenwashing_language", 0),
        },
        "flags":    normalised_flags,
        "evidence": evidence,
        "sources":  [e["url"] for e in evidence if isinstance(e, dict) and e.get("url")],
        # W1 spine: live-view events + result provenance
        "events":         job.get("events") or [],
        "model_used":     job.get("model_used"),
        "model_layer":    job.get("model_layer"),
        "rubric_version": job.get("rubric_version"),
    }


def _with_cache_event(nj: dict, company: str) -> dict:
    """A cache fast-path never ran the pipeline — its live view is one
    honest synthetic event, not silence and never fake queries."""
    from datetime import datetime, timezone
    nj = dict(nj)
    nj["events"] = [{
        "seq": 1, "ts": datetime.now(timezone.utc).isoformat(),
        "trace_id": nj.get("job_id"), "span": "cache", "type": "success",
        "level": "user", "name": "cache_hit", "data": {"company": company},
    }]
    return nj


# ─── NFR-09 relay fallback ────────────────────────────────────────────────────
# When Supabase is down, the analysis-service cannot persist results and our
# get_job() returns None — but the service keeps an in-memory copy and serves
# it at GET /result/{job_id}. Falling back to that relay is what makes
# "write failure → result still reaches the user via polling" actually true.

def _relay_lookup(job_id: str) -> dict | None:
    analysis_url = os.environ.get("ANALYSIS_SERVICE_URL", "http://localhost:8001")
    try:
        res = httpx.get(f"{analysis_url}/result/{job_id}", timeout=3)
        res.raise_for_status()
        record = res.json()
    except Exception as e:
        print(f"relay lookup failed for {job_id}: {e}")
        return None
    if not isinstance(record, dict) or record.get("status") in (None, "unknown"):
        return None
    print(f"relay hit for {job_id} — status={record.get('status')} "
          f"(served from analysis-service memory, NFR-09)")
    return record


def _fetch_relay_history() -> list[dict]:
    """List view of the relay (PROD-1 L1). Contract: [] on ANY failure —
    a dead analysis-service degrades /api/history to the DB view, never 500s."""
    analysis_url = os.environ.get("ANALYSIS_SERVICE_URL", "http://localhost:8001")
    try:
        res = httpx.get(f"{analysis_url}/relay", timeout=3)
        res.raise_for_status()
        rows = res.json().get("results") or []
    except Exception as e:
        print(f"relay history fetch failed (degrading to DB view): {e}")
        return []
    return rows if isinstance(rows, list) else []


_HISTORY_LIMIT = 10


def merge_history(db_rows: list[dict], relay_rows: list[dict]) -> list[dict]:
    """
    One recent-analyses view over two sources of truth (PROD-1 L1).

    The analyses a user JUST ran are exactly the ones most likely to be
    missing from Supabase (free-tier outage, failed write) — and exactly
    the ones a "recent" surface exists for. So the list is always the
    merge, not a fallback-only read:

      * dedupe by job_id; on collision the DB row wins (persisted = canonical);
      * every row carries source: "db" | "relay" so the UI can be honest
        that relay rows live in a FIFO(50) and vanish on service restart;
      * rows are re-thinned here whatever the sources carried — the
        "no debug payloads to the browser" red line holds at this boundary;
      * global completed_at desc sort (None-safe: undated legacy rows sink),
        capped at the same 10 the DB query used.
    """
    def thin(row: dict, source: str) -> dict:
        return {
            "job_id":       row.get("job_id"),
            "company_name": row.get("company_name"),
            "score":        row.get("score"),
            "risk_level":   row.get("risk_level"),
            "completed_at": row.get("completed_at"),
            "source":       source,
        }

    merged: dict[str, dict] = {}
    for row in relay_rows or []:
        t = thin(row, "relay")
        if t["job_id"]:
            merged[t["job_id"]] = t
    for row in db_rows or []:
        t = thin(row, "db")
        if t["job_id"]:
            merged[t["job_id"]] = t   # overwrites the relay copy: DB wins

    rows = sorted(merged.values(),
                  key=lambda r: r.get("completed_at") or "", reverse=True)
    return rows[:_HISTORY_LIMIT]


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    company = (req.company_name or "").strip()
    if not company:
        return {"error": "Company name cannot be empty"}

    # Check cache (Supabase → local_cache.json fallback).
    # manual_content BYPASSES it: the user asked to analyse THEIR text, and
    # a cached report of the company cannot answer that. Without this guard,
    # pasting a claim for a cached name silently discarded the user's input
    # (C-4 family — found by E2E 14 re-analysing Shell).
    cached = None if req.manual_content else get_cached_company(company)
    if cached:
        job_id = cached["job_id"]

        # Local cache hit — build synthetic job record
        if str(job_id).startswith("local:"):
            job = get_job_with_local_fallback(job_id, company)
            if job:
                return _with_cache_event(_normalise_job(job), company)

        # Supabase cache hit — fetch the full job record
        job = get_job(job_id)
        if job:
            return _with_cache_event(_normalise_job(job), company)

    # No cache hit — create new job and trigger analysis service
    job_id = str(uuid.uuid4())[:8]
    create_job(job_id, company)

    analysis_url = os.environ.get("ANALYSIS_SERVICE_URL", "http://localhost:8001")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{analysis_url}/run",
                json={
                    "job_id":         job_id,
                    "company_name":   company,
                    "manual_content": req.manual_content,
                },
                timeout=5,
            )
    except Exception as e:
        print(f"Failed to trigger analysis service: {e}")
        # Non-fatal — analysis service may already be processing

    return {
        "job_id":  job_id,
        "id":      job_id,
        "status":  "processing",
        "message": "Analysis started",
    }


@router.get("/report/{job_id}")
def get_report(job_id: str):
    # Handle local cache synthetic job IDs
    if job_id.startswith("local:"):
        company = job_id[6:]   # strip "local:" prefix
        job = get_job_with_local_fallback(job_id, company)
        if job:
            return _normalise_job(job)
        return {"error": "Job not found"}

    # Active jobs always have a relay projection, regardless of whether the
    # DB write succeeded. Read it first so a slow/unavailable Supabase cannot
    # consume the polling thread pool and hide a result that is already ready.
    # Once the analysis service has restarted and forgotten the FIFO entry,
    # durable/legacy reports naturally fall through to Supabase.
    job = _relay_lookup(job_id) or get_job(job_id)
    if not job:
        return {"error": "Job not found"}
    return _normalise_job(job)


@router.get("/report/{job_id}/pdf")
def download_pdf(job_id: str):
    if job_id.startswith("local:"):
        company = job_id[6:]
        job = get_job_with_local_fallback(job_id, company)
    else:
        job = _relay_lookup(job_id) or get_job(job_id)

    if not job or job.get("status") != "completed":
        return {"error": "Report not ready"}

    path = generate_pdf(job)
    company_name = job.get("company_name", "report")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{company_name}_greenwashing_report.pdf",
    )


@router.get("/history")
def history():
    # Same composition pattern as GET /report/{job_id}: the DB read plus the
    # NFR-09 relay, composed at the route — db/supabase.py stays a pure
    # Supabase layer, relay access stays where _relay_lookup already lives.
    return {"results": merge_history(get_history(), _fetch_relay_history())}
