"""
Backend tests — Phase 1 (current architecture only)

Tests only what currently exists and works:
- Health check
- /api/analyze accepts a valid request
- Local cache fallback works when Supabase is unavailable

Does NOT test:
- Real Supabase read/write (not yet integrated)
- Real Claude/Gemini API calls (not yet tested)
- Real NewsAPI calls (not yet tested)
"""

import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app

client = TestClient(app)


def test_health():
    """Service is running and reachable."""
    response = client.get("/health")
    assert response.status_code == 200


def test_analyze_accepts_valid_request():
    """POST /api/analyze accepts a company name and returns 200."""
    response = client.post(
        "/api/analyze",
        json={"company_name": "Patagonia"}
    )
    assert response.status_code == 200


def test_analyze_accepts_query_field():
    """POST /api/analyze also accepts 'query' as the company name field."""
    response = client.post(
        "/api/analyze",
        json={"query": "Shell"}
    )
    assert response.status_code == 200


def test_analyze_rejects_empty_company():
    """POST /api/analyze with empty company name returns an error."""
    response = client.post(
        "/api/analyze",
        json={"company_name": ""}
    )
    data = response.json()
    assert "error" in data


def test_local_cache_patagonia_returns_result():
    """
    Patagonia is in local_cache.json.
    Even with Supabase unavailable (placeholder key in CI),
    the system must serve the COMPLETE cached report — a lenient
    "score or job_id" assertion previously masked a cache-path bug.
    """
    response = client.post(
        "/api/analyze",
        json={"company_name": "Patagonia"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert isinstance(data["score"], int) and data["score"] > 0
    assert data["evidence"], "cached evidence objects must be present"


def test_history_returns_list():
    """GET /api/history always returns a list, even when Supabase is down."""
    response = client.get("/api/history")
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert isinstance(data["results"], list)


def test_history_row_shape_uses_job_id():
    """History rows speak the API-wide job vocabulary: job_id (matching POST
    /analyze and GET /report/{job_id}) — never the raw DB column `id`.
    Regression (audit C-2): the UI read job_id while the API sent id, so the
    Reports list rendered 'undefined' in every row's meta line."""
    from db.supabase import history_row

    db_row = {"id": "j-123", "company_name": "Acme", "score": 61,
              "risk_level": "High Risk", "completed_at": "2026-07-02T05:00:00Z"}
    out = history_row(db_row)
    assert out["job_id"] == "j-123"
    assert "id" not in out
    assert set(out) == {"job_id", "company_name", "score", "risk_level", "completed_at"}
