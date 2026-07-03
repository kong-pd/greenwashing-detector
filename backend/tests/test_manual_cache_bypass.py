"""PROD-1 L3 fallout — manual_content must BYPASS the company cache.

Found by E2E 14: re-analysing "Shell" with pasted content returned the
CACHED Shell report and silently discarded the user's text — the direct
descendant of the _manualContent-dropped bug (E2E 08's ancestor, C-4
family). The contract:

  * company in cache + manual_content present → a FRESH job (new job_id,
    status processing); the user asked to analyse THEIR text, and the
    cache cannot answer that;
  * company in cache + no manual_content → the cache fast-path, unchanged.

Hermetic: get_cached_company / get_job_with_local_fallback are patched at
the route's own seam; the analysis-service dispatch is fire-and-forget
(dead service → logged, non-fatal), so no network is needed.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
import routes.analyze as analyze_routes

client = TestClient(app)

CACHED = {"job_id": "local:shell"}
CACHED_JOB = {
    "id": "local:shell", "company_name": "Shell", "status": "completed",
    "score": 78, "risk_level": "High Risk", "summary": "cached summary",
    "flags": [], "evidence": [], "dimension_scores": {},
    "completed_at": "2026-07-01T00:00:00+00:00",
}


def _patch_cache(monkeypatch):
    monkeypatch.setattr(analyze_routes, "get_cached_company",
                        lambda name: CACHED, raising=False)
    monkeypatch.setattr(analyze_routes, "get_job_with_local_fallback",
                        lambda job_id, company: dict(CACHED_JOB), raising=False)


def test_manual_content_bypasses_the_cache(monkeypatch):
    _patch_cache(monkeypatch)
    res = client.post("/api/analyze", json={
        "company_name": "Shell",
        "manual_content": "Shell sustainability update 2026: net-zero pathway.",
    })
    body = res.json()
    assert body.get("status") == "processing", (
        "user-supplied content means a fresh run — the cache cannot answer it"
    )
    assert body.get("job_id") != "local:shell"
    assert body.get("summary") is None or body.get("summary") == ""


def test_plain_company_still_takes_the_cache_fast_path(monkeypatch):
    _patch_cache(monkeypatch)
    res = client.post("/api/analyze", json={"company_name": "Shell"})
    body = res.json()
    assert body.get("job_id") == "local:shell"
    assert body.get("status") == "completed"
    assert body.get("summary") == "cached summary"
    # The fast-path stays honest about itself: one synthetic cache event.
    assert any(e.get("name") == "cache_hit" for e in body.get("events") or [])
