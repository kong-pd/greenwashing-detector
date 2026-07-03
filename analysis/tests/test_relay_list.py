"""PROD-1 L1 — GET /relay: the list view of the NFR-09 in-memory relay.

GET /result/{job_id} already lets the web-service recover ONE stranded
result. This endpoint is its plural: the web-service merges it into
/api/history so analyses that never reached Supabase still show up as
"recent". Contract under test:

  * only COMPLETED records are listed (processing/failed jobs are not
    history — they are either still on screen or honestly failed);
  * each row is the THIN public shape — exactly
    {job_id, company_name, score, risk_level, completed_at} — the relay's
    full record (events, sources, summary) never leaves this endpoint,
    keeping the "no debug payloads to the browser" red line intact;
  * newest completed_at first, mirroring the Supabase history query.
"""
import os
import sys

# Standalone-import safety: do not depend on an alphabetically earlier test
# file having inserted the analysis dir first (the CI free-ride trap).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient

import main as analysis_main
from main import _RELAY, _RELAY_ORDER, _relay_put

client = TestClient(analysis_main.app)

THIN_KEYS = {"job_id", "company_name", "score", "risk_level", "completed_at"}


@pytest.fixture(autouse=True)
def clean_relay():
    """The relay is module-global state shared with the pipeline tests —
    snapshot, run against a clean slate, restore."""
    saved, saved_order = dict(_RELAY), list(_RELAY_ORDER)
    _RELAY.clear()
    _RELAY_ORDER.clear()
    yield
    _RELAY.clear()
    _RELAY.update(saved)
    _RELAY_ORDER.clear()
    _RELAY_ORDER.extend(saved_order)


def _seed_completed(job_id, company, score, completed_at):
    _relay_put(job_id, {
        "id":           job_id,
        "company_name": company,
        "status":       "completed",
        "score":        score,
        "risk_level":   "High Risk" if score >= 60 else "Low Risk",
        "summary":      "MOCK summary — must never appear in the list",
        "sources":      [{"id": "E-01", "title": "full evidence object"}],
        "events":       [{"seq": 1, "name": "cache_hit"}],
        "completed_at": completed_at,
    })


def test_relay_list_empty():
    res = client.get("/relay")
    assert res.status_code == 200
    assert res.json() == {"results": []}


def test_relay_list_only_completed_jobs():
    _seed_completed("done-1", "Aster Renewables", 72, "2026-07-01T10:00:00+00:00")
    _relay_put("run-1",  {"id": "run-1",  "status": "processing", "step": "Analysing..."})
    _relay_put("fail-1", {"id": "fail-1", "status": "failed",
                          "fail_reason": "content_not_relevant"})

    rows = client.get("/relay").json()["results"]
    assert [r["job_id"] for r in rows] == ["done-1"]


def test_relay_list_rows_are_thin_and_leak_nothing():
    _seed_completed("done-1", "Aster Renewables", 72, "2026-07-01T10:00:00+00:00")

    row = client.get("/relay").json()["results"][0]
    assert set(row) == THIN_KEYS, (
        "list rows must be exactly the 5-field public shape — the relay's "
        "full record (summary, sources, events) stays server-side"
    )
    assert row["job_id"] == "done-1"
    assert row["company_name"] == "Aster Renewables"
    assert row["score"] == 72
    assert row["risk_level"] == "High Risk"
    assert row["completed_at"] == "2026-07-01T10:00:00+00:00"


def test_relay_list_newest_first():
    _seed_completed("old",  "Old Corp",  40, "2026-07-01T08:00:00+00:00")
    _seed_completed("new",  "New Corp",  72, "2026-07-01T12:00:00+00:00")
    _seed_completed("mid",  "Mid Corp",  55, "2026-07-01T10:00:00+00:00")

    rows = client.get("/relay").json()["results"]
    assert [r["job_id"] for r in rows] == ["new", "mid", "old"]
