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
    try:
        get_db().table("analysis_jobs").update({"step": step}).eq("id", job_id).execute()
    except Exception as e:
        print(f"update_step failed (non-critical): {e}")


def save_result(job_id: str, result: dict):
    from datetime import datetime, timezone
    try:
        db = get_db()
        db.table("analysis_jobs").update({
            "status":       "completed",
            "score":        result.get("score"),
            "risk_level":   result.get("risk_level"),
            "summary":      result.get("summary"),
            "sources":      result.get("evidence") or [],   # store full evidence list
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        for flag in result.get("flags") or []:
            db.table("analysis_flags").insert({
                "job_id":      job_id,
                "type":        flag.get("type"),
                "description": flag.get("description"),
                "source":      flag.get("source", ""),
            }).execute()

    except Exception as e:
        print(f"save_result failed: {e}")
        # Non-fatal — result will still be returned via the in-memory path


def save_failed(job_id: str, reason: str):
    try:
        get_db().table("analysis_jobs").update({
            "status":     "failed",
            "fail_reason": reason,
        }).eq("id", job_id).execute()
    except Exception as e:
        print(f"save_failed DB write failed (non-critical): {e}")


@app.post("/run")
async def run(req: RunRequest):
    asyncio.create_task(process(req))
    return {"status": "started"}


async def process(req: RunRequest):
    try:
        # Step 1 — Scrape content
        update_step(req.job_id, "Fetching company content...")
        content = req.manual_content
        if not content:
            content = await scrape(req.company_name)
        if not content:
            save_failed(req.job_id, "scraping_failed")
            return

        # Step 2 — Enrich with external evidence
        update_step(req.job_id, "Gathering external data...")
        evidence_list, cdp_data = await enrich(req.company_name)

        # Step 3 — AI scoring
        update_step(req.job_id, "Analysing with AI...")
        result = analyze(
            company_name=req.company_name,
            content=content,
            evidence_list=evidence_list,
            cdp=cdp_data,
        )
        if not result:
            save_failed(req.job_id, "analysis_failed")
            return

        # Step 4 — Persist
        save_result(req.job_id, result)

    except Exception as e:
        print(f"process() error for job {req.job_id}: {e}")
        save_failed(req.job_id, str(e))
