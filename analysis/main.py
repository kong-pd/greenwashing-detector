"""
analysis/main.py — GreenCheck Analysis Service (port 8001)
"""

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

app = FastAPI(title="GreenCheck Analysis Service")


# ── DB client ────────────────────────────────────────────────────────────────

def get_db():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])


# ── Models ───────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    job_id: str
    company_name: str
    manual_content: str | None = None


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "analysis"}


# ── Job helpers ──────────────────────────────────────────────────────────────

def update_step(job_id: str, step: str):
    try:
        get_db().table("analysis_jobs").update({"step": step}).eq("id", job_id).execute()
        print(f"[{job_id}] step → {step}")
    except Exception as e:
        print(f"[{job_id}] update_step failed (non-critical): {e}")


def save_result(job_id: str, result: dict):
    """
    Persist completed analysis result to Supabase.
    """
    from datetime import datetime, timezone
    try:
        db = get_db()

        dim_scores = (
            result.get("dimension_scores")
            or result.get("dimensionScores")
            or {}
        )
        db.table("analysis_jobs").update({
            "status":           "completed",
            "score":            result.get("score"),
            "risk_level":       result.get("risk_level"),
            "summary":          result.get("summary"),
            "sources":          result.get("evidence") or [],
            "dimension_scores": dim_scores,
            "completed_at":     datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        for flag in result.get("flags") or []:
            ftype = flag.get("type", "")
            severity = flag.get("severity") or (
                "high"   if ftype in ("Data Contradiction", "Negative News") else
                "medium" if ftype in ("Vague Claims", "Lack of Certification") else
                "low"
            )
            db.table("analysis_flags").insert({
                "job_id":      job_id,
                "type":        ftype,
                "severity":    severity,
                "description": flag.get("description", ""),
                "source":      flag.get("source", ""),
            }).execute()

        print(f"[{job_id}] saved — score={result.get('score')}, "
              f"risk={result.get('risk_level')}, "
              f"flags={len(result.get('flags') or [])}, "
              f"evidence={len(result.get('evidence') or [])}")

    except Exception as e:
        print(f"[{job_id}] save_result failed: {e}")


def save_failed(job_id: str, reason: str):
    """
    Mark job as failed with a specific reason code.

    Reason codes:
      scraping_not_found — Google search found no relevant ESG link
      scraping_blocked   — Found URL but access was blocked / timed out
      analysis_failed    — AI scoring pipeline failed
    """
    try:
        get_db().table("analysis_jobs").update({
            "status":      "failed",
            "fail_reason": reason,
        }).eq("id", job_id).execute()
        print(f"[{job_id}] marked failed — reason: {reason}")
    except Exception as e:
        print(f"[{job_id}] save_failed DB write failed (non-critical): {e}")


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/run")
async def run(req: RunRequest):
    asyncio.create_task(process(req))
    return {"status": "started", "job_id": req.job_id}


# ── Pipeline ─────────────────────────────────────────────────────────────────

async def process(req: RunRequest):
    """
    Full analysis pipeline:
      1. Scrape ESG content (or use manual_content)
         scraper.py now returns (content, fail_reason) — two distinct failure modes:
           scraping_not_found — no ESG page found in Google results
           scraping_blocked   — page found but access denied / timed out
      2. Enrich with external evidence (NewsAPI + CDP stub)
      3. Score with AI (Claude → Gemini → local_cache → mock)
      4. Persist to Supabase
    """
    print(f"[{req.job_id}] starting pipeline for '{req.company_name}'")
    try:
        # ── Step 1: content ──────────────────────────────────────────────────
        update_step(req.job_id, "Fetching company content...")

        if req.manual_content:
            # User-provided content — skip scraping entirely
            content = req.manual_content
            print(f"[{req.job_id}] using manual content ({len(content)} chars)")
        else:
            # scrape() returns (content, fail_reason)
            content, fail_reason = await scrape(req.company_name)

            if not content:
                # Pass the specific fail_reason so the frontend can show
                # the appropriate banner (not found vs. access blocked)
                print(f"[{req.job_id}] scraping failed: {fail_reason}")
                save_failed(req.job_id, fail_reason or "scraping_not_found")
                return

        # ── Step 2: enrich ───────────────────────────────────────────────────
        update_step(req.job_id, "Gathering external data...")
        evidence_list, cdp_data = await enrich(req.company_name)
        print(f"[{req.job_id}] enriched — "
              f"{len(evidence_list)} evidence items")

        # ── Step 3: AI scoring ───────────────────────────────────────────────
        update_step(req.job_id, "Analysing with AI...")
        result = analyze(
            company_name=req.company_name,
            content=content,
            evidence_list=evidence_list,
            cdp=cdp_data,
        )
        if not result:
            print(f"[{req.job_id}] analyzer returned None — failing")
            save_failed(req.job_id, "analysis_failed")
            return

        # ── Step 4: persist ──────────────────────────────────────────────────
        update_step(req.job_id, "Saving results...")
        save_result(req.job_id, result)

    except Exception as e:
        print(f"[{req.job_id}] pipeline exception: {e}")
        save_failed(req.job_id, str(e))
