"""tracing.py — the spine.

One append-only event log per pipeline run, with a stable envelope:

    {seq, ts, trace_id, span, type, level, name, data}

Three consumers, one data model:
  · Live UI      — the `level="user"` projection, delivered through the
                   existing poll response (SSE later; transport is a detail).
  · Quality loop — the full log, dumped as JSONL: failure corpus entries,
                   golden-set candidates, eval fixtures.
  · Metrics      — fallback-layer hit rates and stage latencies.

The Stage contract is deliberately tiny (this is what direction ③ actually
needed instead of an OpenAPI registry): a StageMeta describing the stage,
run_stage() to execute it with timing + error classification, StageResult
back. Nothing here knows about FastAPI, Supabase, or models.
"""
from __future__ import annotations

import inspect
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Errors we consider transient. String matching is a pragmatic net for
# provider SDKs that wrap timeouts in their own exception types.
_RETRYABLE_TYPES = (TimeoutError, ConnectionError)
_RETRYABLE_HINTS = ("timeout", "timed out", "connection", "temporarily")


@dataclass
class StageMeta:
    """Static description of a pipeline stage.

    `redact` names data keys that must never be written to any log —
    enforcement lives in Trace.emit so no call site can forget it.
    """
    name: str
    kind: str = "network"          # network | llm | db | cpu
    timeout_ms: int | None = None  # advisory for now
    retries: int = 0
    redact: tuple = ()


@dataclass
class StageResult:
    ok: bool
    data: object = None
    error: dict | None = None                 # {type, message, retryable}
    meta: dict = field(default_factory=dict)  # {latency_ms, attempts}


class Trace:
    """Append-only event log for one pipeline run (trace_id = job_id)."""

    def __init__(self, trace_id: str, on_user_event=None):
        self.trace_id = trace_id
        self.events: list[dict] = []
        self._seq = 0
        self._on_user = on_user_event
        self._redact: set[str] = set()

    def add_redactions(self, keys):
        self._redact.update(keys)

    def emit(self, span: str, type_: str, name: str,
             level: str = "debug", **data) -> dict:
        self._seq += 1
        clean = {k: ("[redacted]" if k in self._redact else v)
                 for k, v in data.items()}
        ev = {
            "seq":      self._seq,
            "ts":       datetime.now(timezone.utc).isoformat(),
            "trace_id": self.trace_id,
            "span":     span,
            "type":     type_,      # start | progress | success | error | retry | fallback
            "level":    level,      # user | debug
            "name":     name,
            "data":     clean,
        }
        self.events.append(ev)
        if level == "user" and self._on_user:
            try:
                self._on_user(ev)
            except Exception:
                pass  # a broken consumer must never break the pipeline
        return ev

    def span_emitter(self, span: str):
        """Curried emit for handing a single span to a subsystem
        (e.g. the analyzer ladder) without exposing the whole trace."""
        def _emit(type_: str, name: str, level: str = "debug", **data):
            return self.emit(span, type_, name, level=level, **data)
        return _emit

    def user_events(self) -> list[dict]:
        return [e for e in self.events if e["level"] == "user"]

    def dump_jsonl(self, dir_: str | None = None) -> str | None:
        """Best-effort full-trace persistence — the quality loop's feedstock.
        Ephemeral on free-tier hosts; that is acceptable for now."""
        dir_ = dir_ or os.environ.get("TRACE_DIR", "traces")
        try:
            os.makedirs(dir_, exist_ok=True)
            path = os.path.join(dir_, f"{self.trace_id}.jsonl")
            with open(path, "w") as f:
                for ev in self.events:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
            return path
        except Exception as e:
            print(f"[trace] dump failed (non-critical): {e}")
            return None


def _classify(err: Exception) -> dict:
    msg = str(err)
    retryable = isinstance(err, _RETRYABLE_TYPES) or any(
        h in msg.lower() for h in _RETRYABLE_HINTS
    )
    return {"type": type(err).__name__, "message": msg[:300],
            "retryable": retryable}


async def run_stage(trace: Trace, meta: StageMeta, fn, *args, **kwargs) -> StageResult:
    """Execute one stage under the contract: timing, retry (per meta),
    error classification, and debug telemetry into the trace. Domain-level
    user events (page_found, sources_found, …) stay at the call site —
    the runner only knows it ran *a* stage."""
    trace.add_redactions(meta.redact)
    attempts = 0
    while True:
        attempts += 1
        trace.emit(meta.name, "start", "stage_start",
                   kind=meta.kind, attempt=attempts)
        t0 = time.perf_counter()
        try:
            out = fn(*args, **kwargs)
            if inspect.isawaitable(out):
                out = await out
            latency = int((time.perf_counter() - t0) * 1000)
            trace.emit(meta.name, "success", "stage_success",
                       latency_ms=latency, attempt=attempts)
            return StageResult(ok=True, data=out,
                               meta={"latency_ms": latency, "attempts": attempts})
        except Exception as e:  # noqa: BLE001 — classified, never swallowed
            latency = int((time.perf_counter() - t0) * 1000)
            error = _classify(e)
            if error["retryable"] and attempts <= meta.retries:
                trace.emit(meta.name, "retry", "stage_retry",
                           level="user", attempt=attempts, error=error["type"])
                continue
            trace.emit(meta.name, "error", "stage_error",
                       latency_ms=latency, **error)
            return StageResult(ok=False, error=error,
                               meta={"latency_ms": latency, "attempts": attempts})
