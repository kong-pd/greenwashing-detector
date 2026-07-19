"""
analysis/main.py — GreenCheck Analysis Service (port 8001)
"""
import asyncio
import sys
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from scraper import scrape
from enricher import enrich
from sanitize import sanitize_text, sanitize_evidence
from analyzer import analyze
from tracing import Trace, StageMeta, run_stage
from relevance import check_relevance
import os
from supabase import ClientOptions, create_client

load_dotenv()

app = FastAPI(title="GreenCheck Analysis Service")
_DB_TIMEOUT_SECONDS = float(os.environ.get("SUPABASE_TIMEOUT_SECONDS", "5"))


# ── DB client ────────────────────────────────────────────────────────────────

def get_db():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_ANON_KEY"],
        options=ClientOptions(postgrest_client_timeout=_DB_TIMEOUT_SECONDS),
    )


# ── Models ───────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    job_id: str
    company_name: str
    manual_content: str | None = None


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "analysis"}


# ── In-memory result relay (NFR-09 write-failure fallback) ──────────────────
# Supabase is the only path from analysis-service to web-service. If a DB
# write fails (outage / bad credentials), the completed result would otherwise
# be unreachable and the user would poll into a timeout. This relay keeps the
# last N results in memory and exposes them via GET /result/{job_id}; the
# web-service falls back to it when its own DB read returns nothing.
# "Result is returned directly to the frontend via the polling response —
#  job is not persisted, user still receives their complete report." (NFR-09)

_RELAY_MAX = 50
_RELAY: dict[str, dict] = {}        # job_id → job-shaped record
_RELAY_ORDER: list[str] = []        # FIFO eviction


def _relay_append_event(job_id: str, ev: dict):
    """The live-UI transport: user-level events ride the relay record and
    reach the browser through the existing poll — no new infrastructure."""
    rec = _RELAY.get(job_id) or {"id": job_id, "status": "processing"}
    rec.setdefault("events", []).append(ev)
    _relay_put(job_id, rec)


def _relay_put(job_id: str, record: dict):
    if job_id not in _RELAY:
        _RELAY_ORDER.append(job_id)
        while len(_RELAY_ORDER) > _RELAY_MAX:
            evicted = _RELAY_ORDER.pop(0)
            _RELAY.pop(evicted, None)
    _RELAY[job_id] = {**_RELAY.get(job_id, {}), **record}


def _relay_get(job_id: str) -> dict | None:
    return _RELAY.get(job_id)


# ── Job helpers ──────────────────────────────────────────────────────────────

def update_step(job_id: str, step: str):
    _relay_put(job_id, {"id": job_id, "status": "processing", "step": step})
    try:
        get_db().table("analysis_jobs").update({"step": step}).eq("id", job_id).execute()
        print(f"[{job_id}] step → {step}")
    except Exception as e:
        print(f"[{job_id}] update_step failed (non-critical): {e}")


def save_result(job_id: str, result: dict, company_name: str = ""):
    """
    Persist completed analysis result to Supabase.
    The relay copy is written FIRST and unconditionally — when the DB write
    fails it is the only path the result has back to the user (NFR-09).
    """
    from datetime import datetime, timezone

    dim_scores = (
        result.get("dimension_scores")
        or result.get("dimensionScores")
        or {}
    )
    completed_at = datetime.now(timezone.utc).isoformat()

    _relay_put(job_id, {
        "id":               job_id,
        "company_name":     company_name,
        "status":           "completed",
        "step":             None,
        "score":            result.get("score"),
        "risk_level":       result.get("risk_level"),
        "confidence":       result.get("confidence"),
        "summary":          result.get("summary"),
        "sources":          result.get("evidence") or [],
        "dimension_scores": dim_scores,
        "completed_at":     completed_at,
        "analysis_flags":   result.get("flags") or [],
        "model_used":       result.get("model_used"),
        "model_layer":      result.get("model_layer"),
        "rubric_version":   result.get("rubric_version"),
    })

    persisted_to = "relay"
    try:
        db = get_db()

        db.table("analysis_jobs").update({
            "status":           "completed",
            "score":            result.get("score"),
            "risk_level":       result.get("risk_level"),
            "confidence":       result.get("confidence"),
            "summary":          result.get("summary"),
            "sources":          result.get("evidence") or [],
            "dimension_scores": dim_scores,
            "model_used":       result.get("model_used"),
            "model_layer":      result.get("model_layer"),
            "rubric_version":   result.get("rubric_version"),
            "completed_at":     completed_at,
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
        persisted_to = "db"

    except Exception as e:
        print(f"[{job_id}] save_result DB write failed — "
              f"result is still served via the in-memory relay (NFR-09): {e}")
    return persisted_to

def save_failed(job_id: str, reason: str):
    """
    Mark job as failed with a specific reason code.

    Reason codes:
      scraping_not_found — Google search found no relevant ESG link
      scraping_blocked   — Found URL but access was blocked / timed out
      analysis_failed    — AI scoring pipeline failed
    """
    _relay_put(job_id, {"id": job_id, "status": "failed", "fail_reason": reason})
    try:
        get_db().table("analysis_jobs").update({
            "status":      "failed",
            "fail_reason": reason,
        }).eq("id", job_id).execute()
        print(f"[{job_id}] marked failed — reason: {reason}")
    except Exception as e:
        print(f"[{job_id}] save_failed DB write failed (non-critical): {e}")


def mark_degraded(job_id: str, reason: str):
    """
    Record a degraded-but-continuing state (e.g. scraping_snippet_fallback).

    Unlike save_failed, status stays 'processing' — the pipeline continues and
    the job will complete normally. fail_reason carries the data-quality note
    so the frontend can render an honest "based on search snippets" banner on
    the finished report. save_result never touches fail_reason, so the marker
    survives completion.
    """
    _relay_put(job_id, {"id": job_id, "fail_reason": reason})
    try:
        get_db().table("analysis_jobs").update({
            "fail_reason": reason,
        }).eq("id", job_id).execute()
        print(f"[{job_id}] degraded content source — {reason} (pipeline continues)")
    except Exception as e:
        print(f"[{job_id}] mark_degraded DB write failed (non-critical): {e}")


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/result/{job_id}")
def relay_result(job_id: str):
    """
    NFR-09 fallback read: the web-service calls this when its own Supabase
    read returns nothing for an in-flight job, so a DB outage never strands a
    finished report. Returns the job-shaped record or {"status": "unknown"}.
    """
    record = _relay_get(job_id)
    if record:
        return record
    return {"status": "unknown", "job_id": job_id}


@app.get("/relay")
def relay_list():
    """
    PROD-1 L1: the plural of /result/{job_id}. Lists COMPLETED relay records
    in the thin public shape so the web-service can merge them into
    /api/history — analyses whose DB write failed still count as "recent".

    Only the five list fields leave this endpoint; the relay's full record
    (summary, sources, events) stays server-side. In-memory FIFO(50): the
    list is honest only about this process's lifetime, and the UI says so.
    """
    rows = [
        {
            "job_id":       rec.get("id"),
            "company_name": rec.get("company_name"),
            "score":        rec.get("score"),
            "risk_level":   rec.get("risk_level"),
            "completed_at": rec.get("completed_at"),
        }
        for rec in _RELAY.values()
        if rec.get("status") == "completed"
    ]
    rows.sort(key=lambda r: r.get("completed_at") or "", reverse=True)
    return {"results": rows}


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
      3. Score with AI (Gemini → Groq → Claude; fail closed in production)
      4. Persist to Supabase
    """
    print(f"[{req.job_id}] starting pipeline for '{req.company_name}'")
    trace = Trace(req.job_id,
                  on_user_event=lambda ev: _relay_append_event(req.job_id, ev))
    try:
        # ── Step 1: content ──────────────────────────────────────────────────
        update_step(req.job_id, "Fetching company content...")

        if req.manual_content:
            # User-provided content — skip scraping entirely
            content = req.manual_content
            print(f"[{req.job_id}] using manual content ({len(content)} chars)")
            trace.emit("scrape", "success", "manual_content",
                       level="user", chars=len(content))
        else:
            # scrape() returns (content, reason). Three shapes:
            #   (text, None)                        → full scrape OK
            #   (text, "scraping_snippet_fallback") → degraded source, continue
            #   (None, blocked/not_found)           → hard failure
            r = await run_stage(trace, StageMeta(name="scrape", kind="network"),
                                scrape, req.company_name)
            content, fail_reason = r.data if r.ok else (None, "scraping_failed")

            if not content:
                # Pass the specific fail_reason so the frontend can show
                # the appropriate banner (not found vs. access blocked)
                print(f"[{req.job_id}] scraping failed: {fail_reason}")
                trace.emit("scrape", "error", fail_reason or "scraping_not_found",
                           level="user")
                save_failed(req.job_id, fail_reason or "scraping_not_found")
                trace.dump_jsonl()
                return

            if content and fail_reason != "scraping_snippet_fallback":
                trace.emit("scrape", "success", "page_found",
                           level="user", chars=len(content))
            if fail_reason == "scraping_snippet_fallback":
                # Degraded middle state: content comes from search snippets.
                # Record the marker (status stays processing) and continue —
                # the completed report keeps fail_reason for the honesty banner.
                trace.emit("scrape", "progress", "snippet_fallback",
                           level="user", chars=len(content))
                mark_degraded(req.job_id, fail_reason)

        # ── Step 1.4: sanitise (SEC-3) ───────────────────────────────────────
        # One seam for ALL analyzer-bound content — scraped, pasted, or
        # PDF-extracted: strip control/zero-width smuggling characters,
        # neutralise prompt sentinels at ingestion, cap length. Debug-level
        # trace accounting: machinery, not Live-view news.
        content, _san = sanitize_text(content)
        trace.emit("sanitize", "success", "content_sanitised",
                   removed=_san["removed"], truncated=_san["truncated"],
                   chars=len(content))

        # ── Step 1.5: relevance gate (AI-1) ─────────────────────────────────
        # Runs on ALL content — scraped, pasted, or extracted from a PDF.
        # Off-topic input is refused before any model spends a token on it.
        update_step(req.job_id, "Checking content relevance...")
        rel = check_relevance(content)
        trace.emit("relevance", "success", "relevance_checked", level="user",
                   signals=rel["signals"], relevant=rel["relevant"])
        if not rel["relevant"]:
            print(f"[{req.job_id}] content not relevant "
                  f"({rel['signals']} signals) — refusing to score")
            trace.emit("relevance", "error", "content_not_relevant",
                       level="user", signals=rel["signals"])
            save_failed(req.job_id, "content_not_relevant")
            trace.dump_jsonl()
            return

        # ── Step 2: enrich ───────────────────────────────────────────────────
        update_step(req.job_id, "Gathering external data...")
        r = await run_stage(trace, StageMeta(name="enrich", kind="network"),
                            enrich, req.company_name)
        evidence_list, cdp_data = r.data if r.ok else ([], "No data")
        evidence_list, _ev_removed = sanitize_evidence(evidence_list)
        if _ev_removed:
            trace.emit("sanitize", "success", "evidence_sanitised",
                       removed=_ev_removed, items=len(evidence_list))
        trace.emit("enrich", "success", "sources_found",
                   level="user", sources=len(evidence_list))
        print(f"[{req.job_id}] enriched — "
              f"{len(evidence_list)} evidence items")

        # ── Step 3: AI scoring ───────────────────────────────────────────────
        update_step(req.job_id, "Analysing with AI...")
        result = analyze(
            company_name=req.company_name,
            content=content,
            evidence_list=evidence_list,
            cdp=cdp_data,
            emit=trace.span_emitter("analyze"),
        )
        if not result:
            print(f"[{req.job_id}] analyzer returned None — failing")
            trace.emit("analyze", "error", "analysis_failed", level="user")
            save_failed(req.job_id, "analysis_failed")
            trace.dump_jsonl()
            return

        # ── Step 4: persist ──────────────────────────────────────────────────
        update_step(req.job_id, "Saving results...")
        persisted_to = save_result(req.job_id, result, company_name=req.company_name)
        trace.emit("persist", "success",
                   "db_saved" if persisted_to == "db" else "relay_only",
                   level="user")
        trace.dump_jsonl()

    except Exception as e:
        print(f"[{req.job_id}] pipeline exception: {e}")
        trace.emit("pipeline", "error", "pipeline_exception",
                   error=type(e).__name__, message=str(e)[:300])
        save_failed(req.job_id, str(e))
        trace.dump_jsonl()
