from fastapi import FastAPI
from pydantic import BaseModel
import asyncio
from dotenv import load_dotenv
from scraper import scrape
from enricher import enrich
from analyzer import analyze
import os
from supabase import create_client

load_dotenv()

app = FastAPI(title="Analysis Service")

def get_db():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

class RunRequest(BaseModel):
    job_id: str
    company_name: str
    manual_content: str | None = None

def update_step(job_id: str, step: str):
    get_db().table("analysis_jobs").update({"step": step}).eq("id", job_id).execute()

def save_result(job_id: str, result: dict):
    from datetime import datetime, timezone
    db = get_db()
    db.table("analysis_jobs").update({
        "status": "completed",
        "score": result["score"],
        "risk_level": result["risk_level"],
        "summary": result["summary"],
        "sources": result.get("sources", []),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    for flag in result.get("flags", []):
        db.table("analysis_flags").insert({
            "job_id": job_id,
            "type": flag["type"],
            "description": flag["description"],
            "source": flag.get("source", ""),
        }).execute()

def save_failed(job_id: str, reason: str):
    get_db().table("analysis_jobs").update({
        "status": "failed",
        "fail_reason": reason
    }).eq("id", job_id).execute()

@app.post("/run")
async def run(req: RunRequest):
    asyncio.create_task(process(req))
    return {"status": "started"}

async def process(req: RunRequest):
    try:
        # Step 1: Scrape content
        update_step(req.job_id, "Fetching company content...")
        content = req.manual_content
        if not content:
            content = await scrape(req.company_name)
        if not content:
            save_failed(req.job_id, "scraping_failed")
            return

        # Step 2: Enrich with external data
        update_step(req.job_id, "Gathering external data...")
        news, cdp = await enrich(req.company_name)

        # Step 3: AI analysis
        update_step(req.job_id, "Analysing with AI...")
        result = analyze(req.company_name, content, news, cdp)
        if not result:
            save_failed(req.job_id, "analysis_failed")
            return

        # Step 4: Save results
        save_result(req.job_id, result)

    except Exception as e:
        save_failed(req.job_id, str(e))
