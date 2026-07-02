"""W1 spine — trace/event schema, Stage contract, and ladder instrumentation.

The envelope {seq, ts, trace_id, span, type, level, name, data} is the
spine every consumer reads: the live UI (level=user projection), the
failure corpus / golden set (full JSONL), and the fallback metrics.
"""
import asyncio
import os

import pytest

from tracing import Trace, StageMeta, run_stage
from analyzer import analyze, RUBRIC_VERSION


def test_envelope_and_monotonic_seq():
    t = Trace("job-1")
    t.emit("scrape", "success", "page_found", chars=812)
    t.emit("enrich", "success", "sources_found", level="user", sources=3)
    assert [e["seq"] for e in t.events] == [1, 2]
    ev = t.events[0]
    assert set(ev) == {"seq", "ts", "trace_id", "span", "type", "level", "name", "data"}
    assert ev["trace_id"] == "job-1" and ev["data"] == {"chars": 812}


def test_user_projection_filters_debug():
    t = Trace("job-2")
    t.emit("analyze", "progress", "layer_attempt", level="debug", model="gemini")
    t.emit("analyze", "success", "model_used", level="user", model="mock", layer=1)
    assert [e["name"] for e in t.user_events()] == ["model_used"]


def test_user_event_hook_fires_only_for_user_level():
    seen = []
    t = Trace("job-3", on_user_event=seen.append)
    t.emit("scrape", "progress", "attempt", level="debug")
    t.emit("scrape", "success", "page_found", level="user", chars=10)
    assert [e["name"] for e in seen] == ["page_found"]


def test_run_stage_success_records_latency():
    t = Trace("job-4")

    async def fetch():
        return ("content", None)

    r = asyncio.run(run_stage(t, StageMeta(name="scrape", kind="network"), fetch))
    assert r.ok and r.data == ("content", None)
    assert r.meta["latency_ms"] >= 0
    names = [e["name"] for e in t.events]
    assert names == ["stage_start", "stage_success"]


def test_run_stage_error_is_classified():
    t = Trace("job-5")

    async def boom():
        raise TimeoutError("upstream timed out")

    r = asyncio.run(run_stage(t, StageMeta(name="enrich", kind="network"), boom))
    assert not r.ok
    assert r.error["type"] == "TimeoutError" and r.error["retryable"] is True
    assert t.events[-1]["name"] == "stage_error"


def test_mock_analyze_is_annotated_and_emits_model_used(monkeypatch):
    monkeypatch.setenv("USE_MOCK", "true")
    t = Trace("job-6")
    result = analyze("Acme", "content", [], emit=t.span_emitter("analyze"))
    assert result["model_used"] == "mock"
    assert result["rubric_version"] == RUBRIC_VERSION
    user = [e for e in t.user_events() if e["name"] == "model_used"]
    assert user and user[0]["data"]["model"] == "mock"
    # Annotation must never mutate the shared module-level mock
    from analyzer import MOCK_RESULT
    assert "model_used" not in MOCK_RESULT
