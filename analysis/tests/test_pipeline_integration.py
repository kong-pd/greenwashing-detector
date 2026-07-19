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
                    manual_content="Net-zero by 2045: Scope 1 emissions down 40% on renewable power. We are committed to net zero." * 10))

    updates = fake_db.rows("analysis_jobs", "update")
    final = updates[-1][1]
    assert final["status"] == "completed"
    # Exactly the columns B's get_job/_normalise_job consume (wiki 06 contract):
    for col in ("score", "risk_level", "confidence", "summary", "sources",
                "dimension_scores", "model_used", "model_layer",
                "rubric_version", "completed_at"):
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
    assert relay["confidence"] == 0.85
    assert any(e.get("name") == "db_saved" for e in relay.get("events") or [])


def test_save_result_reports_relay_only_when_db_write_fails(monkeypatch):
    _RELAY.clear()

    def unavailable():
        raise RuntimeError("db down")

    monkeypatch.setattr(analysis_main, "get_db", unavailable)
    result = {
        "score": 44, "risk_level": "Medium Risk", "confidence": 0.61,
        "summary": "s", "dimension_scores": {}, "flags": [], "evidence": [],
        "model_used": "test-model", "model_layer": 2, "rubric_version": "3.3",
    }

    assert analysis_main.save_result("it-relay", result, "Relay Co") == "relay"
    assert _relay_get("it-relay")["status"] == "completed"


def test_db_client_uses_bounded_postgrest_timeout(monkeypatch):
    captured = {}

    def fake_create_client(url, key, options):
        captured.update(url=url, key=key, options=options)
        return "client"

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-key")
    monkeypatch.setattr(analysis_main, "_DB_TIMEOUT_SECONDS", 0.75)
    monkeypatch.setattr(analysis_main, "create_client", fake_create_client)

    assert analysis_main.get_db() == "client"
    assert captured["options"].postgrest_client_timeout == 0.75


# ── 4: snippet middle state — degraded but completed ──────────────────────────

def test_snippet_fallback_marks_degraded_then_completes(fake_db, monkeypatch):
    async def fake_scrape(name):
        return ("[Search-snippet digest] net-zero Scope 1 emissions, renewable power. " + "content " * 60,
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
                    manual_content="Net-zero by 2045: Scope 1 emissions down 40% on renewable power. x" * 200))

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
