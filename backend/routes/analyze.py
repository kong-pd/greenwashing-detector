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
        "confidence": 0.85,
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
    }


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


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    company = (req.company_name or "").strip()
    if not company:
        return {"error": "Company name cannot be empty"}

    # Check cache (Supabase → local_cache.json fallback)
    cached = get_cached_company(company)
    if cached:
        job_id = cached["job_id"]

        # Local cache hit — build synthetic job record
        if str(job_id).startswith("local:"):
            job = get_job_with_local_fallback(job_id, company)
            if job:
                return _normalise_job(job)

        # Supabase cache hit — fetch the full job record
        job = get_job(job_id)
        if job:
            return _normalise_job(job)

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

    job = get_job(job_id)
    if not job:
        # NFR-09: DB unreachable / write never landed — ask the analysis
        # service's in-memory relay before giving up.
        job = _relay_lookup(job_id)
    if not job:
        return {"error": "Job not found"}
    return _normalise_job(job)


@router.get("/report/{job_id}/pdf")
def download_pdf(job_id: str):
    if job_id.startswith("local:"):
        company = job_id[6:]
        job = get_job_with_local_fallback(job_id, company)
    else:
        job = get_job(job_id) or _relay_lookup(job_id)

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
    return {"results": get_history()}
