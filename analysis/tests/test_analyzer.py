"""
Analysis service tests — Phase 1 (current architecture only)

Tests only what currently exists and works:
- Local cache lookup (exact and partial match)
- Analyzer fallback chain does not crash
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


# ── Local cache tests ──────────────────────────────────────────────────────────

def test_local_cache_loads():
    """local_cache.json exists and loads without error."""
    from analyzer import _LOCAL_CACHE
    assert isinstance(_LOCAL_CACHE, dict)
    assert len(_LOCAL_CACHE) > 0


def test_local_cache_contains_demo_companies():
    """All five demo companies are in the local cache."""
    from analyzer import _LOCAL_CACHE
    keys = list(_LOCAL_CACHE.keys())
    for company in ["shell", "h&m", "patagonia", "tesla", "bp"]:
        assert company in keys, f"'{company}' missing from local cache"


def test_local_cache_exact_match():
    """Exact company name lookup returns a result."""
    from analyzer import _lookup_local_cache
    result = _lookup_local_cache("patagonia")
    assert result is not None
    assert "score" in result


def test_local_cache_partial_match():
    """Partial company name lookup returns a result."""
    from analyzer import _lookup_local_cache
    result = _lookup_local_cache("Patagonia Inc")
    assert result is not None


def test_local_cache_case_insensitive():
    """Lookup is case-insensitive."""
    from analyzer import _lookup_local_cache
    assert _lookup_local_cache("SHELL") is not None
    assert _lookup_local_cache("Shell") is not None
    assert _lookup_local_cache("shell") is not None


def test_local_cache_miss_returns_none():
    """Unknown company returns None (not an error)."""
    from analyzer import _lookup_local_cache
    result = _lookup_local_cache("CompanyThatDefinitelyDoesNotExist99999")
    assert result is None


# ── Analyzer fallback tests ────────────────────────────────────────────────────

def test_analyzer_returns_result_for_cached_company():
    """
    With USE_MOCK=true and both APIs set to placeholder keys,
    analyzer returns a result for a cached company via local cache.
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


def test_analyzer_returns_mock_for_unknown_company():
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
    Enricher returns an empty list when NEWS_API_KEY is not set
    or is a placeholder — does not raise an exception.
    """
    from enricher import fetch_news
    result = await fetch_news("Patagonia")
    assert isinstance(result, list)
    # Empty list is acceptable — enricher fails gracefully


@pytest.mark.asyncio
async def test_enricher_quote_extraction():
    """Quote extraction helper returns None for empty article."""
    from enricher import _extract_quote
    assert _extract_quote({}) is None
    assert _extract_quote({"title": "Hi", "description": None, "content": None}) is None


@pytest.mark.asyncio
async def test_enrich_returns_tuple():
    """enrich() always returns a (list, string) tuple."""
    from enricher import enrich
    evidence_list, cdp_summary = await enrich("Patagonia")
    assert isinstance(evidence_list, list)
    assert isinstance(cdp_summary, str)
