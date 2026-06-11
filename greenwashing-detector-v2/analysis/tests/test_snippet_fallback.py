"""
Snippet-fallback contract tests (Phase 6).

The middle state `scraping_snippet_fallback` sits BESIDE the two hard
failures — it must only fire when blocked AND the search snippets are rich
enough, and it must never replace `scraping_blocked` (which drives the
manual-input UI).
"""

import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scraper import (
    _assemble_snippet_content, _snippet_or_blocked,
    SNIPPET_FALLBACK, SNIPPET_MIN_CHARS,
)


def _organic(n_items=5, snippet_len=80):
    return [{"title": f"Result {i}", "snippet": "s" * snippet_len,
             "link": f"https://example.com/{i}"} for i in range(n_items)]


def test_marker_string_is_the_agreed_contract():
    # Cross-team string — A consumes it for the banner, B passes it through.
    assert SNIPPET_FALLBACK == "scraping_snippet_fallback"


def test_assemble_joins_titles_and_snippets():
    content = _assemble_snippet_content("Acme", _organic())
    assert content is not None
    assert "Acme" in content                 # digest header names the company
    assert "Result 0" in content
    assert len(content) <= 8000


def test_assemble_returns_none_when_too_thin():
    thin = [{"title": "t", "snippet": "tiny", "link": "https://x"}]
    assert _assemble_snippet_content("Acme", thin) is None


def test_assemble_returns_none_when_no_snippets():
    no_snip = [{"title": "t", "link": "https://x"}]
    assert _assemble_snippet_content("Acme", no_snip) is None


def test_blocked_with_rich_snippets_degrades_not_fails():
    content, reason = _snippet_or_blocked("Acme", _organic())
    assert content is not None
    assert reason == SNIPPET_FALLBACK


def test_blocked_with_thin_snippets_stays_blocked():
    # The contract's hard rule: snippet state never masks scraping_blocked.
    content, reason = _snippet_or_blocked("Acme", [])
    assert content is None
    assert reason == "scraping_blocked"


def test_threshold_boundary():
    # A digest just under the threshold must not pass.
    header_overhead = len(
        "[Search-snippet digest for A — full page was inaccessible; "
        "the following are search result excerpts]\n\n"
    )
    body_len = max(1, SNIPPET_MIN_CHARS - header_overhead - 5)
    thin = [{"title": "", "snippet": "x" * body_len, "link": "https://x"}]
    assert _assemble_snippet_content("A", thin) is None
