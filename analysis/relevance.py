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

STEMS: tuple[str, ...] = (
    "sustainab", "emission", "carbon", "net-zero", "net zero", "climat",
    "klima", "nachhaltig", "esg", "scope 1", "scope 2", "scope 3",
    "renewab", "recycl", "greenhouse", "ghg", "decarbon", "sbti", "tcfd",
    "gri ", "biodivers", "offset", "solar", "circular econom",
    "environmental", "supply chain audit",
)

MIN_CHARS = 40
MIN_SIGNALS = 3


def check_relevance(content: str | None) -> dict:
    """Returns {relevant, signals, matched}. Fails closed: empty or short
    content is never relevant."""
    text = (content or "").lower()
    if len(text.strip()) < MIN_CHARS:
        return {"relevant": False, "signals": 0, "matched": []}
    matched = sorted({s for s in STEMS if s in text})
    return {
        "relevant": len(matched) >= MIN_SIGNALS,
        "signals": len(matched),
        "matched": matched[:8],
    }
