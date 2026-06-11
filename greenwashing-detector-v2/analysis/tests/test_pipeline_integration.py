"""
Pipeline integration tests — run the real process() end to end with:
  · USE_MOCK=true                  (AI layer short-circuits to MOCK_RESULT)
  · a FakeDB recorder               (captures exactly what would hit Supabase)
  · monkeypatched scrape()/enrich() (no network, no Playwright launch)

What this pins down:
  1. save_result writes the fields B's get_job reads (the table contract, wiki 06)
  2. every flag row carries a severity
  3. the in-memory relay holds a completed, job-shaped record (NFR-09)
  4. the snippet middle state marks fail_reason but still completes
  5. hard scrape failures end as status=failed with the right reason
"""

import sys, os, asyncio
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("USE_MOCK", "true")
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "placeholder")

import main as analysis_main
from main import process, RunRequest, _relay_get, _RELAY


# ── FakeDB: records update/insert calls in Supabase-client shape ──────────────

class _FakeTable:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self._pending = None
    def update(self, payload):
        self._pending = ("update", payload); return self
    def insert(self, payload):
        self.store.setdefault(self.name, []).append(("insert", payload, None))
        return self
    def eq(self, col, val):
        if self._pending:
            op, payload = self._pending
            self.store.setdefault(self.name, []).append((op, payload, (col, val)))
            self._pending = None
        return self
    def execute(self):
        return self

class FakeDB:
    def __init__(self):
        self.store = {}
    def table(self, name):
        return _FakeTable(self.store, name)
    def rows(self, name, op=None):
        return [r for r in self.store.get(name, []) if op is None or r[0] == op]


@pytest.fixture()
def fake_db(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(analysis_main, "get_db", lambda: db)
    _RELAY.clear()
    return db


def _run(req):
    asyncio.get_event_loop_policy()
    asyncio.run(process(req))


# ── 1+2+3: happy path through manual_content ──────────────────────────────────

def test_pipeline_completes_and_writes_table_contract(fake_db, monkeypatch):
    async def fake_enrich(name):
        return ([{"id": "E-01", "kind": "News", "title": "t", "org": "Reuters",
                  "date": "2026-05-01", "url": "https://x",
                  "quote": "q" * 30, "weight": 0.7}], "cdp stub")
    monkeypatch.setattr(analysis_main, "enrich", fake_enrich)

    _run(RunRequest(job_id="it-001", company_name="Acme Corp",
                    manual_content="We are committed to net zero." * 10))

    updates = fake_db.rows("analysis_jobs", "update")
    final = updates[-1][1]
    assert final["status"] == "completed"
    # Exactly the columns B's get_job/_normalise_job consume (wiki 06 contract):
    for col in ("score", "risk_level", "summary", "sources",
                "dimension_scores", "completed_at"):
        assert col in final, col
    assert isinstance(final["sources"], list)

    flag_rows = fake_db.rows("analysis_flags", "insert")
    assert len(flag_rows) == 3
    for _, payload, _ in flag_rows:
        assert payload["job_id"] == "it-001"
        assert payload["severity"] in ("high", "medium", "low")

    relay = _relay_get("it-001")
    assert relay and relay["status"] == "completed"
    assert relay["company_name"] == "Acme Corp"
    assert isinstance(relay.get("analysis_flags"), list)


# ── 4: snippet middle state — degraded but completed ──────────────────────────

def test_snippet_fallback_marks_degraded_then_completes(fake_db, monkeypatch):
    async def fake_scrape(name):
        return ("[Search-snippet digest] " + "content " * 60,
                "scraping_snippet_fallback")
    async def fake_enrich(name):
        return ([], "cdp stub")
    monkeypatch.setattr(analysis_main, "scrape", fake_scrape)
    monkeypatch.setattr(analysis_main, "enrich", fake_enrich)

    _run(RunRequest(job_id="it-002", company_name="Blocked Co",
                    manual_content=None))

    updates = fake_db.rows("analysis_jobs", "update")
    payloads = [p for _, p, _ in updates]
    # mark_degraded wrote the marker without flipping status…
    assert any(p == {"fail_reason": "scraping_snippet_fallback"} for p in payloads)
    # …and the job still finished.
    assert payloads[-1]["status"] == "completed"

    relay = _relay_get("it-002")
    assert relay["status"] == "completed"
    assert relay["fail_reason"] == "scraping_snippet_fallback"   # banner survives


# ── 5: hard failures keep their reasons ────────────────────────────────────────

@pytest.mark.parametrize("reason", ["scraping_not_found", "scraping_blocked"])
def test_hard_scrape_failure_saves_reason(fake_db, monkeypatch, reason):
    async def fake_scrape(name):
        return (None, reason)
    monkeypatch.setattr(analysis_main, "scrape", fake_scrape)

    _run(RunRequest(job_id=f"it-{reason}", company_name="Gone Co",
                    manual_content=None))

    final = fake_db.rows("analysis_jobs", "update")[-1][1]
    assert final == {"status": "failed", "fail_reason": reason}
    assert _relay_get(f"it-{reason}")["status"] == "failed"


def test_analyzer_none_saves_analysis_failed(fake_db, monkeypatch):
    async def fake_enrich(name):
        return ([], "cdp stub")
    monkeypatch.setattr(analysis_main, "enrich", fake_enrich)
    monkeypatch.setattr(analysis_main, "analyze", lambda **kw: None)

    _run(RunRequest(job_id="it-005", company_name="Acme",
                    manual_content="x" * 200))

    final = fake_db.rows("analysis_jobs", "update")[-1][1]
    assert final == {"status": "failed", "fail_reason": "analysis_failed"}


# ── relay endpoint shape ────────────────────────────────────────────────────────

def test_relay_endpoint_unknown_job():
    from fastapi.testclient import TestClient
    client = TestClient(analysis_main.app)
    res = client.get("/result/never-existed")
    assert res.status_code == 200
    assert res.json()["status"] == "unknown"


def test_relay_eviction_keeps_bound(fake_db):
    from main import _relay_put, _RELAY_MAX
    for i in range(_RELAY_MAX + 10):
        _relay_put(f"evict-{i}", {"id": f"evict-{i}", "status": "processing"})
    assert len(_RELAY) <= _RELAY_MAX
    assert _relay_get("evict-0") is None          # oldest evicted
    assert _relay_get(f"evict-{_RELAY_MAX + 9}")  # newest kept
