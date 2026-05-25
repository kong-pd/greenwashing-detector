import uuid
import httpx
import os
from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel
from db.supabase import get_job, create_job, get_history, get_cached_company
from pdf.generator import generate_pdf

router = APIRouter()

class AnalyzeRequest(BaseModel):
    company_name: str
    manual_content: str | None = None

@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.company_name.strip():
        return {"error": "Company name cannot be empty"}

    # Check cache first
    cached = get_cached_company(req.company_name)
    if cached:
        return {"job_id": cached["job_id"], "status": "completed", "cached": True}

    # Create new job
    job_id = str(uuid.uuid4())[:8]
    create_job(job_id, req.company_name)

    # Trigger analysis-service asynchronously
    analysis_url = os.environ.get("ANALYSIS_SERVICE_URL", "http://localhost:8001")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{analysis_url}/run", json={
                "job_id": job_id,
                "company_name": req.company_name,
                "manual_content": req.manual_content,
            }, timeout=5)
    except Exception:
        pass  # Non-blocking: analysis-service handles its own retry

    return {"job_id": job_id, "status": "processing", "message": "Analysis started"}

@router.get("/report/{job_id}")
def get_report(job_id: str):
    job = get_job(job_id)
    if not job:
        return {"error": "Job not found"}
    return job

@router.get("/report/{job_id}/pdf")
def download_pdf(job_id: str):
    job = get_job(job_id)
    if not job or job.get("status") != "completed":
        return {"error": "Report not ready"}
    path = generate_pdf(job)
    return FileResponse(path, media_type="application/pdf",
                        filename=f"{job['company_name']}_greenwashing_report.pdf")

@router.get("/history")
def history():
    return {"results": get_history()}
