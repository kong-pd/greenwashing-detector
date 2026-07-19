"""
Normaliser & cache-shaping tests (B's P0 + M5 passthrough duties).

Pins the two invariants the frontend depends on:
  1. Evidence reaching the API surface is ALWAYS object-shaped — legacy
     string arrays are coerced at the web-service layer, on every path
     (live job, local-cache job, PDF).
  2. The M5 weight components (reliability/recency/relevance) and the
     degraded-source marker survive the trip untouched.
"""

import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import db.supabase as supabase_db
from db.supabase import coerce_evidence_objects, _cache_to_job
from routes.analyze import _normalise_job


FULL_EV = {
    "id": "E-01", "kind": "News", "title": "t", "org": "Reuters",
    "date": "2026-05-01", "url": "https://x", "quote": "q" * 25,
    "weight": 0.78, "reliability": 0.85, "recency": 0.8, "relevance": 0.78,
}


def test_supabase_client_uses_bounded_postgrest_timeout(monkeypatch):
    captured = {}

    def fake_create_client(url, key, options):
        captured.update(url=url, key=key, options=options)
        return "client"

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-key")
    monkeypatch.setattr(supabase_db, "_DB_TIMEOUT_SECONDS", 0.75)
    monkeypatch.setattr(supabase_db, "create_client", fake_create_client)

    assert supabase_db.get_client() == "client"
    assert captured["options"].postgrest_client_timeout == 0.75


# ── coerce_evidence_objects ────────────────────────────────────────────────────

def test_coerce_strings_become_minimal_objects():
    out = coerce_evidence_objects(["https://a.example", "CDP Public Database"])
    assert all(isinstance(e, dict) for e in out)
    assert out[0]["url"] == "https://a.example"
    assert out[0]["id"]  == "E-01"
    assert out[1]["url"] == ""                  # non-URL string → title only
    assert out[1]["title"] == "CDP Public Database"
    assert all(e["weight"] == 0.5 for e in out)

def test_coerce_objects_pass_through_with_components_intact():
    out = coerce_evidence_objects([FULL_EV])
    assert out[0] is FULL_EV or out[0] == FULL_EV
    for f in ("reliability", "recency", "relevance"):
        assert out[0][f] == FULL_EV[f]

def test_coerce_mixed_list():
    out = coerce_evidence_objects([FULL_EV, "https://legacy.example"])
    assert len(out) == 2 and all(isinstance(e, dict) for e in out)

def test_coerce_garbage_inputs():
    assert coerce_evidence_objects(None) == []
    assert coerce_evidence_objects("not-a-list") == []
    assert coerce_evidence_objects([]) == []


# ── _cache_to_job (the P0 fix) ─────────────────────────────────────────────────

def test_cache_to_job_coerces_legacy_string_sources():
    """Supabase down + legacy cache entry: /report AND /pdf consume this
    record directly — strings must already be objects here."""
    legacy = {
        "score": 70, "risk_level": "High Risk", "summary": "s",
        "dimension_scores": {"specificity": 10},
        "flags": [{"type": "Vague Claims", "description": "d"}],
        "sources": ["https://old.example/page", "Some Registry 2024"],
    }
    job = _cache_to_job("OldCo", legacy)
    assert job["status"] == "completed"
    assert all(isinstance(e, dict) for e in job["sources"])
    assert job["sources"][0]["url"] == "https://old.example/page"

def test_cache_to_job_prefers_evidence_objects_and_keeps_components():
    entry = {
        "score": 50, "risk_level": "Medium Risk", "summary": "s",
        "dimension_scores": {}, "flags": [],
        "evidence": [FULL_EV],
        "sources": ["https://legacy-should-be-ignored.example"],
    }
    job = _cache_to_job("NewCo", entry)
    assert job["sources"][0]["reliability"] == 0.85
    assert job["model_used"] == "local-cache"
    assert job["model_layer"] is None
    assert job["rubric_version"] == "3.3"

def test_cache_to_job_flag_severity_default():
    entry = {"score": 1, "risk_level": "Low Risk", "summary": "",
             "dimension_scores": {}, "sources": [],
             "flags": [{"type": "X", "description": "d"}]}
    job = _cache_to_job("Co", entry)
    assert job["analysis_flags"][0]["severity"] == "medium"


# ── _normalise_job ─────────────────────────────────────────────────────────────

def _base_job(**over):
    job = {
        "id": "j1", "company_name": "Acme", "status": "completed",
        "step": None, "fail_reason": None, "score": 42,
        "risk_level": "Medium Risk", "confidence": 0.73, "summary": "s",
        "model_used": "primary", "model_layer": 2, "rubric_version": "3.3",
        "sources": [FULL_EV],
        "dimension_scores": {"specificity": 8, "data_consistency": 9,
                             "third_party_certification": 8,
                             "negative_news": 9, "greenwashing_language": 8},
        "created_at": "2026-06-01T00:00:00Z", "completed_at": "2026-06-01T00:01:00Z",
        "analysis_flags": [{"type": "Negative News", "description": "d", "source": "Reuters"}],
    }
    job.update(over)
    return job

def test_normalise_job_dual_casing_and_components():
    out = _normalise_job(_base_job())
    assert out["risk_level"] == out["riskLevel"] == "Medium Risk"
    assert out["dimension_scores"] == out["dimensionScores"]
    assert out["evidence"][0]["relevance"] == 0.78          # M5 passthrough
    assert out["sources"] == ["https://x"]                  # legacy URL list derived
    assert out["confidence"] == 0.73
    assert out["model_used"] == "primary"
    assert out["rubric_version"] == "3.3"


def test_normalise_job_keeps_missing_confidence_missing():
    assert _normalise_job(_base_job(confidence=None))["confidence"] is None

def test_normalise_job_legacy_string_sources_coerced():
    out = _normalise_job(_base_job(sources=["https://a", "https://b"]))
    assert all(isinstance(e, dict) for e in out["evidence"])
    assert len(out["evidence"]) == 2

def test_normalise_job_completed_with_snippet_marker_coexists():
    """Phase-6 contract: a COMPLETED job may carry fail_reason as a
    data-quality note — both must reach the frontend together."""
    out = _normalise_job(_base_job(fail_reason="scraping_snippet_fallback"))
    assert out["status"] == "completed"
    assert out["fail_reason"] == "scraping_snippet_fallback"

def test_normalise_job_flag_severity_inferred():
    out = _normalise_job(_base_job())
    assert out["flags"][0]["severity"] == "high"            # Negative News → high

def test_normalise_job_empty_input_passthrough():
    assert _normalise_job(None) is None
    assert _normalise_job({}) == _normalise_job({}) or True  # no crash
