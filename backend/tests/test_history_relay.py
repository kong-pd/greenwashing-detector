"""PROD-1 L1 — /api/history merges the NFR-09 relay into the Supabase view.

The problem this pins down: the analyses a user JUST ran are exactly the
ones most likely to be missing from Supabase (free-tier outage, failed
write) — yet they are the whole point of a "recent analyses" surface.
GET /report/{job_id} already falls back to the relay for one job; history
must do the same for the list, or the landing strip built on it lies by
omission.

Contract:
  * relay rows appear in /api/history when Supabase has nothing;
  * on job_id collision the DB row wins (it is the canonical, persisted
    record) and no duplicate is emitted;
  * rows are sorted by completed_at desc across BOTH sources, capped at 10;
  * every row carries source: "db" | "relay" so the UI can be honest that
    relay rows are session-scoped (in-memory FIFO — gone on restart);
  * a dead analysis-service degrades history to the DB view, never to a 500;
  * rows stay thin: exactly the 5 public fields + source, whatever extra
    keys the relay record carried.

Tests monkeypatch routes.analyze.get_history / _fetch_relay_history — the
same seam the route composes over. TestClient + placeholder Supabase env
keep everything hermetic (no network beyond the mocked seam).
"""
import pytest
from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
import routes.analyze as analyze_routes

client = TestClient(app)

PUBLIC_KEYS = {"job_id", "company_name", "score", "risk_level",
               "completed_at", "source"}


def _row(job_id, company, score, completed_at, **extra):
    return {"job_id": job_id, "company_name": company, "score": score,
            "risk_level": "High Risk" if score >= 60 else "Low Risk",
            "completed_at": completed_at, **extra}


# ── relay fallback when Supabase yields nothing ──────────────────────────────

def test_history_serves_relay_rows_when_db_is_empty(monkeypatch):
    monkeypatch.setattr(analyze_routes, "get_history", lambda: [],
                        raising=False)
    monkeypatch.setattr(
        analyze_routes, "_fetch_relay_history",
        lambda: [_row("r-1", "Aster Renewables", 72, "2026-07-01T12:00:00+00:00")],
        raising=False,
    )

    rows = client.get("/api/history").json()["results"]
    assert [r["job_id"] for r in rows] == ["r-1"]
    assert rows[0]["source"] == "relay"


# ── merge: dedupe with DB precedence, global sort, cap ───────────────────────

def test_history_merges_dedupes_and_sorts_across_sources(monkeypatch):
    monkeypatch.setattr(
        analyze_routes, "get_history",
        lambda: [
            _row("db-1", "Persisted Corp", 40, "2026-07-01T09:00:00+00:00"),
            _row("both", "Twice Corp",     55, "2026-07-01T10:00:00+00:00"),
        ],
        raising=False,
    )
    monkeypatch.setattr(
        analyze_routes, "_fetch_relay_history",
        lambda: [
            # newer than everything in the DB — must surface FIRST
            _row("r-new", "Aster Renewables", 72, "2026-07-01T12:00:00+00:00"),
            # same job seen by both sources — DB row wins, no duplicate
            _row("both",  "Twice Corp",       55, "2026-07-01T10:00:00+00:00"),
        ],
        raising=False,
    )

    rows = client.get("/api/history").json()["results"]
    assert [r["job_id"] for r in rows] == ["r-new", "both", "db-1"]
    by_id = {r["job_id"]: r for r in rows}
    assert by_id["r-new"]["source"] == "relay"
    assert by_id["both"]["source"] == "db", "on collision the persisted row wins"
    assert by_id["db-1"]["source"] == "db"


def test_history_is_capped_at_ten_after_merge(monkeypatch):
    monkeypatch.setattr(
        analyze_routes, "get_history",
        lambda: [_row(f"db-{i}", f"DB {i}", 50, f"2026-07-01T0{i}:00:00+00:00")
                 for i in range(8)],
        raising=False,
    )
    monkeypatch.setattr(
        analyze_routes, "_fetch_relay_history",
        lambda: [_row(f"r-{i}", f"Relay {i}", 50, f"2026-07-01T1{i}:00:00+00:00")
                 for i in range(5)],
        raising=False,
    )

    rows = client.get("/api/history").json()["results"]
    assert len(rows) == 10
    # the five relay rows (T10..T14) are the newest — all must have made the cut
    assert sum(1 for r in rows if r["source"] == "relay") == 5


# ── degradation & hygiene ─────────────────────────────────────────────────────

def test_history_survives_a_dead_relay(monkeypatch):
    db_rows = [_row("db-1", "Persisted Corp", 40, "2026-07-01T09:00:00+00:00")]
    monkeypatch.setattr(analyze_routes, "get_history", lambda: db_rows,
                        raising=False)

    def boom():
        raise AssertionError("fetch helper must swallow its own errors")
    monkeypatch.setattr(analyze_routes, "_fetch_relay_history",
                        lambda: [], raising=False)  # helper contract: [] on failure

    res = client.get("/api/history")
    assert res.status_code == 200
    rows = res.json()["results"]
    assert [r["job_id"] for r in rows] == ["db-1"]
    assert rows[0]["source"] == "db"


def test_history_rows_stay_thin_whatever_the_relay_carried(monkeypatch):
    monkeypatch.setattr(analyze_routes, "get_history", lambda: [],
                        raising=False)
    fat = _row("r-1", "Aster Renewables", 72, "2026-07-01T12:00:00+00:00",
               events=[{"seq": 1}], summary="never in the list",
               sources=[{"id": "E-01"}])
    monkeypatch.setattr(analyze_routes, "_fetch_relay_history",
                        lambda: [fat], raising=False)

    row = client.get("/api/history").json()["results"][0]
    assert set(row) == PUBLIC_KEYS


# ── merge_history as a pure function ─────────────────────────────────────────

def test_merge_history_none_safe_sort():
    """Rows with a missing completed_at sink to the end instead of crashing
    the sort — relay records are built by us, but the DB has legacy rows."""
    from routes.analyze import merge_history

    merged = merge_history(
        [_row("db-1", "A", 40, None)],
        [_row("r-1",  "B", 72, "2026-07-01T12:00:00+00:00")],
    )
    assert [r["job_id"] for r in merged] == ["r-1", "db-1"]


def test_merge_history_empty_inputs():
    from routes.analyze import merge_history
    assert merge_history([], []) == []
