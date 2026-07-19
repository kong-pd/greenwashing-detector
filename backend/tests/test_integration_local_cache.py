"""
Backend integration tests — full HTTP surface, Supabase unreachable
(placeholder credentials), exactly the production "断库" (database-outage) scenario.

Covers:
  · /analyze cache hit for all five demo companies → complete report inline,
    evidence objects with weight components, no 5xx anywhere
  · case-insensitive partial match ("Shell plc" → shell)
  · /report/local:<name> and /report/{id}/pdf on the local-cache path
  · the NFR-09 relay: get_job misses → backend asks analysis-service /result
  · PDF generation smoke (WeasyPrint real render) incl. HTML-injection payload
"""

import sys, os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "placeholder")
os.environ.setdefault("ANALYSIS_SERVICE_URL", "http://analysis-under-test")

from main import app

client = TestClient(app)

DEMO = ["Shell", "H&M", "Patagonia", "Tesla", "BP"]


# ── Scenario: DB down, demo companies served from local cache ─────────────────

@pytest.mark.parametrize("company", DEMO)
def test_demo_company_full_report_from_local_cache(company):
    res = client.post("/api/analyze", json={"company_name": company})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert isinstance(data["score"], int)
    assert data["risk_level"] in ("Low Risk", "Medium Risk", "High Risk")
    assert len(data["flags"]) == 3
    for f in data["flags"]:
        assert f["severity"] in ("high", "medium", "low")
    assert data["evidence"], "evidence must not be empty after the P0 cache fix"
    for ev in data["evidence"]:
        assert isinstance(ev, dict)
        for field in ("id", "kind", "title", "org", "date", "url",
                      "quote", "weight", "reliability", "recency", "relevance"):
            assert field in ev, (company, field)
    dims = data["dimensionScores"]
    assert set(dims) == {"specificity", "data_consistency",
                         "third_party_certification", "negative_news",
                         "greenwashing_language"}


def test_partial_case_insensitive_match():
    res = client.post("/api/analyze", json={"company_name": "Shell plc"})
    data = res.json()
    assert data["status"] == "completed"
    assert data["score"] == 78


def test_report_local_prefix_roundtrip():
    res = client.get("/api/report/local:Shell")
    data = res.json()
    assert data["status"] == "completed"
    assert data["evidence"][0]["weight"] >= data["evidence"][-1]["weight"]


def test_pdf_on_local_cache_path():
    res = client.get("/api/report/local:Shell/pdf")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/pdf")
    assert res.content[:5] == b"%PDF-"
    assert len(res.content) > 10_000


def test_unknown_company_returns_job_id_not_5xx():
    res = client.post("/api/analyze", json={"company_name": "Totally Unknown Co 42"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "processing"
    assert data["job_id"]


def test_empty_company_rejected():
    assert "error" in client.post("/api/analyze", json={"company_name": "  "}).json()


def test_history_never_5xx_when_db_down():
    res = client.get("/api/history")
    assert res.status_code == 200
    assert res.json()["results"] == []


def test_unknown_job_error_envelope():
    data = client.get("/api/report/no-such-job").json()
    assert data == {"error": "Job not found"}


# ── NFR-09 relay: DB miss → analysis-service in-memory result ─────────────────

@pytest.fixture()
def relay_backed_analysis(monkeypatch):
    """Stand up the real analysis app in-process and route the backend's
    relay httpx.get through its TestClient — a faithful two-service wire
    without sockets. The analysis `main` module is loaded under a distinct
    name via importlib because `main` is already taken by the backend app
    in sys.modules."""
    import importlib.util
    analysis_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "analysis"))
    spec = importlib.util.spec_from_file_location(
        "analysis_service_main", os.path.join(analysis_dir, "main.py"))
    analysis_main = importlib.util.module_from_spec(spec)
    sys.path.insert(0, analysis_dir)            # so `from scraper import …` resolves
    try:
        sys.modules["analysis_service_main"] = analysis_main
        spec.loader.exec_module(analysis_main)
    finally:
        sys.path.remove(analysis_dir)

    analysis_main._RELAY.clear()
    analysis_client = TestClient(analysis_main.app)

    import routes.analyze as routes_mod

    class _Resp:
        def __init__(self, inner): self._inner = inner
        def raise_for_status(self):
            if self._inner.status_code >= 400:
                raise RuntimeError(self._inner.status_code)
        def json(self): return self._inner.json()

    def fake_get(url, timeout=3):
        path = "/" + url.split("/", 3)[-1]
        return _Resp(analysis_client.get(path))

    monkeypatch.setattr(routes_mod.httpx, "get", fake_get)
    monkeypatch.setattr(
        routes_mod,
        "get_job",
        lambda _job_id: pytest.fail(
            "an active relay result must not wait for the database"
        ),
    )
    return analysis_main._relay_put


def test_relay_serves_completed_result_when_db_write_failed(relay_backed_analysis):
    relay_backed_analysis("relay-job-1", {
        "id": "relay-job-1", "company_name": "Relay Co",
        "status": "completed", "step": None, "fail_reason": None,
        "score": 55, "risk_level": "Medium Risk", "summary": "via relay",
        "sources": [{"id": "E-01", "kind": "News", "title": "t", "org": "BBC",
                     "date": "2026-05-01", "url": "https://x", "quote": "q" * 25,
                     "weight": 0.7, "reliability": 0.85, "recency": 0.95,
                     "relevance": 0.7}],
        "dimension_scores": {"specificity": 11},
        "completed_at": "2026-06-10T00:00:00Z",
        "analysis_flags": [{"type": "Negative News", "description": "d",
                            "source": "BBC", "severity": "high"}],
    })
    data = client.get("/api/report/relay-job-1").json()
    assert data["status"] == "completed"
    assert data["summary"] == "via relay"
    assert data["evidence"][0]["reliability"] == 0.85
    assert data["flags"][0]["severity"] == "high"


def test_relay_processing_state_passthrough(relay_backed_analysis):
    relay_backed_analysis("relay-job-2", {
        "id": "relay-job-2", "status": "processing", "step": "Analysing with AI...",
    })
    data = client.get("/api/report/relay-job-2").json()
    assert data["status"] == "processing"
    assert data["step"] == "Analysing with AI..."


# ── PDF generator hardening ────────────────────────────────────────────────────

def test_pdf_renderer_contract_is_windows_safe_and_escapes_html(monkeypatch):
    """Exercise the complete HTML builder without requiring native Pango.

    The fake renderer deliberately re-opens the output path, pinning the
    Windows contract that NamedTemporaryFile must be closed first.
    """
    import sys
    from types import SimpleNamespace

    captured = {}

    class FakeHTML:
        def __init__(self, string):
            captured["html"] = string

        def write_pdf(self, path):
            with open(path, "wb") as output:
                output.write(b"%PDF-renderer-contract")

    monkeypatch.setitem(sys.modules, "weasyprint", SimpleNamespace(HTML=FakeHTML))

    from pdf.generator import generate_pdf
    path = generate_pdf({
        "id": "contract-1",
        "company_name": "<script>alert(1)</script> & Co",
        "score": 61,
        "risk_level": "High Risk",
        "summary": "Summary with <b>tags</b>",
        "model_used": "test-model",
        "rubric_version": "3.3",
    })

    assert open(path, "rb").read().startswith(b"%PDF-")
    assert "<script>alert(1)</script>" not in captured["html"]
    assert "&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co" in captured["html"]
    assert "AI engine: test-model" in captured["html"]
    assert "Rubric v3.3" in captured["html"]


def test_pdf_survives_injection_and_mixed_evidence():
    from pdf.generator import generate_pdf
    job = {
        "id": "inj-1", "company_name": "<script>alert(1)</script> & Co",
        "status": "completed", "score": 61, "risk_level": "High Risk",
        "summary": "Summary with <b>tags</b> & ampersands",
        "dimension_scores": {"specificity": 12},
        "analysis_flags": [{"type": "Vague <Claims>", "severity": "medium",
                            "description": "Uses <undefined> terms & more",
                            "source": "Site <X>"}],
        "sources": [
            {"id": "E-01", "kind": "News", "title": "Title <with> markup",
             "org": "Reuters & Co", "date": "2026-01-01", "url": "https://x",
             "quote": 'She said "<hello>"', "weight": 0.7,
             "reliability": 0.85, "recency": 0.8, "relevance": 0.7},
            "https://legacy-bare-string.example.com",
        ],
    }
    path = generate_pdf(job)
    raw = open(path, "rb").read()
    assert raw[:5] == b"%PDF-"
    assert len(raw) > 5_000
