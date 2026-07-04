"""relevance.py — the AI-1 gate (W2).

Deterministic, zero-network topical check that runs before any model is
asked to score: content with too few sustainability signals is refused
with `content_not_relevant` instead of being confidently mis-scored
(the "homework PDF gets a greenwashing verdict" failure).

Deliberately a stem heuristic, not an LLM call: it is free, hermetic,
eval-pinned by the golden set, and fails closed on short input. Stems
cover EN + DE; ES/FR are a known gap noted in the README.
"""
from __future__ import annotations

from pack import load_pack

# ARCH-1 Phase A: the lexicon is domain knowledge and travels with the
# pack; the gate LOGIC (stem matching, fail-closed thresholds) is engine.
_REL = load_pack()["relevance"]

STEMS: tuple[str, ...] = tuple(_REL["stems"])
MIN_CHARS = _REL["min_chars"]
MIN_SIGNALS = _REL["min_signals"]


def check_relevance(content: str | None, cfg: dict | None = None) -> dict:
    """Returns {relevant, signals, matched}. Fails closed: empty or short
    content is never relevant.

    `cfg` (ARCH-1 Phase B): an explicit pack `relevance` dict — lets tests
    and future multi-pack callers gate under a DIFFERENT domain's lexicon
    without env reloads. Default remains the active pack's module binding,
    so the production path is unchanged."""
    stems = tuple(cfg["stems"]) if cfg else STEMS
    min_chars = cfg["min_chars"] if cfg else MIN_CHARS
    min_signals = cfg["min_signals"] if cfg else MIN_SIGNALS
    text = (content or "").lower()
    if len(text.strip()) < min_chars:
        return {"relevant": False, "signals": 0, "matched": []}
    matched = sorted({s for s in stems if s in text})
    return {
        "relevant": len(matched) >= min_signals,
        "signals": len(matched),
        "matched": matched[:8],
    }
