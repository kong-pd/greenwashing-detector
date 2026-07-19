"""
Analysis service tests — Phase 1 (current architecture only)

Tests only what currently exists and works:
- Explicit mock mode returns a deterministic fixture
- Production fallback chain fails closed when providers are exhausted
- Evidence weight clamping works correctly
- Enricher returns a list (empty is acceptable)

Does NOT test:
- Real Claude/Gemini API calls
- Real NewsAPI calls
- Real Playwright scraping
"""

import pytest
import sys
import os

# Add analysis to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Analyzer fallback tests ────────────────────────────────────────────────────

def test_analyzer_returns_result_in_explicit_mock_mode():
    """
    USE_MOCK=true is the only mode allowed to return the generic fixture.
    """
    from analyzer import analyze
    result = analyze(
        company_name="Patagonia",
        content="Patagonia sustainability content",
        evidence_list=[],
        cdp="No CDP data"
    )
    assert result is not None
    assert "score" in result


def test_explicit_mock_mode_is_company_agnostic():
    """
    For an unknown company with USE_MOCK=true,
    analyzer returns the generic mock result.
    """
    from analyzer import analyze
    result = analyze(
        company_name="UnknownCompanyXYZ",
        content="Some content",
        evidence_list=[],
        cdp="No CDP data"
    )
    assert result is not None
    assert "score" in result


def test_analyzer_fails_closed_when_all_real_providers_fail(monkeypatch):
    """Production must never turn provider exhaustion into a demo verdict."""
    import analyzer

    monkeypatch.setenv("USE_MOCK", "false")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(analyzer, "_try_gemini_chain", lambda *a, **kw: None)
    monkeypatch.setattr(analyzer, "_try_groq_chain", lambda *a, **kw: None)

    events = []
    result = analyzer.analyze(
        "Shell",
        "Net-zero Scope 1 emissions renewable energy sustainability content",
        [],
        "No data",
        emit=lambda type_, name, **data: events.append((type_, name, data)),
    )

    assert result is None
    assert any(name == "all_models_failed" for _, name, _ in events)
    assert not any(name == "model_used" for _, name, _ in events)


def test_analyzer_result_has_required_fields():
    """Analyzer result contains all required fields."""
    from analyzer import analyze
    result = analyze("Shell", "content", [], "no cdp")
    required = ["score", "risk_level", "flags", "summary"]
    for field in required:
        assert field in result, f"Missing field: {field}"


def test_analyzer_score_in_range():
    """Score is between 0 and 100."""
    from analyzer import analyze
    result = analyze("Patagonia", "content", [], "no cdp")
    assert 0 <= result["score"] <= 100


# ── Weight clamping tests ──────────────────────────────────────────────────────

def test_weight_clamp_filing():
    """Filing weights are clamped to 0.85–0.95."""
    from analyzer import _clamp_weight
    assert _clamp_weight("Filing", 0.99) == 0.95
    assert _clamp_weight("Filing", 0.50) == 0.85
    assert _clamp_weight("Filing", 0.90) == 0.90


def test_weight_clamp_news():
    """News weights are clamped to 0.40–0.80."""
    from analyzer import _clamp_weight
    assert _clamp_weight("News", 0.10) == 0.40
    assert _clamp_weight("News", 0.95) == 0.80
    assert _clamp_weight("News", 0.60) == 0.60


def test_weight_clamp_none_returns_midpoint():
    """None weight returns the midpoint of the band."""
    from analyzer import _clamp_weight
    result = _clamp_weight("Filing", None)
    assert 0.85 <= result <= 0.95


# ── Enricher tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_enricher_returns_list_without_api_key():
    """
    Enricher returns an empty list when SERPER_API_KEY is not set
    or is a placeholder — does not raise an exception.
    """
    from enricher import fetch_news_serper
    result = await fetch_news_serper("Patagonia")
    assert isinstance(result, list)
    # Empty list is acceptable — enricher fails gracefully


@pytest.mark.asyncio
async def test_enricher_quote_extraction():
    """
    Quote extraction helper (_extract_quote) now accepts a string, not a dict.
    Returns None for None/empty/too-short strings.
    """
    from enricher import _extract_quote
    # None and empty string → None
    assert _extract_quote(None) is None
    assert _extract_quote("") is None
    # String shorter than MIN_LEN (20 chars) → None
    assert _extract_quote("Hi") is None
    # String of 20+ chars → returned (truncated to 300)
    long_str = "This is long enough to pass the minimum length requirement."
    assert _extract_quote(long_str) is not None


@pytest.mark.asyncio
async def test_enrich_returns_tuple():
    """enrich() always returns a (list, string) tuple."""
    from enricher import enrich
    evidence_list, cdp_summary = await enrich("Patagonia")
    assert isinstance(evidence_list, list)
    assert isinstance(cdp_summary, str)
