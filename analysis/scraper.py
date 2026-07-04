import httpx
import os
from playwright.async_api import async_playwright

from pack import load_pack, fill

_SEARCH = load_pack()["search"]
# Domain keywords for URL/result triage travel with the pack (ARCH-1).
ESG_KEYWORDS = list(_SEARCH["esg_keywords"])

# Snippet fallback threshold: combined organic snippets must reach this length
# to be considered a usable degraded content source. Below it, we keep the
# scraping_blocked path so the manual-input UI is still triggered (the snippet
# state must never mask the blocked state — cross-team contract, see wiki 03/10).
SNIPPET_MIN_CHARS = 200

# Degraded-success marker. Returned *alongside content* (content is not None):
# the pipeline continues to a completed report, and the frontend shows an
# honest "based on search snippets" banner. Sits BESIDE scraping_blocked /
# scraping_not_found — it never replaces them.
SNIPPET_FALLBACK = "scraping_snippet_fallback"


async def _search_esg(company_name: str) -> tuple[str | None, list[dict]]:
    """
    Serper search for the company's ESG page.
    Returns (best_url, organic_results) — organic results are kept so that
    their snippets can serve as degraded content if Playwright is blocked.
    """
    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        print("Serper: no API key configured")
        return None, []

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "q": fill(_SEARCH["scrape_query"], company_name),
                    "num": 10,
                },
                timeout=10,
            )
            res.raise_for_status()
            results = res.json().get("organic", [])
    except Exception as e:
        print(f"Serper search failed: {e}")
        return None, []

    for result in results:
        url = result.get("link", "")
        if url and any(kw in url.lower() for kw in ESG_KEYWORDS):
            print(f"Serper found ESG URL: {url}")
            return url, results

    # 没找到含关键词的 URL，用第一个结果
    if results:
        url = results[0].get("link", "")
        print(f"Serper fallback URL: {url}")
        return url, results

    return None, []


def _assemble_snippet_content(company_name: str, results: list[dict]) -> str | None:
    """
    Degraded content source: join the organic snippets Serper already returned.
    Used only when Playwright cannot access the page. Returns None when the
    combined snippets are too thin to analyse honestly (< SNIPPET_MIN_CHARS).
    """
    parts = []
    for r in results:
        snippet = (r.get("snippet") or "").strip()
        title   = (r.get("title") or "").strip()
        if snippet:
            parts.append(f"{title}: {snippet}" if title else snippet)
    if not parts:
        return None
    content = (
        f"[Search-snippet digest for {company_name} — full page was inaccessible; "
        f"the following are search result excerpts]\n\n" + "\n\n".join(parts)
    )
    if len(content) < SNIPPET_MIN_CHARS:
        return None
    return content[:8000]


async def scrape(company_name: str) -> tuple[str | None, str | None]:
    """
    用 Serper 找到 ESG 页面 URL，再用 Playwright 抓取内容。

    Returns (content, reason):
      (text, None)                        — full-page scrape succeeded
      (text, "scraping_snippet_fallback") — page blocked, but Serper snippets
                                            were enough to continue (degraded)
      (None, "scraping_not_found")        — no ESG link / empty page
      (None, "scraping_blocked")          — blocked AND snippets too thin
                                            → manual-input UI path
    """
    # Step 1: 用 Serper 找 URL（并保留 organic 结果备 snippet 降级）
    target_url, organic_results = await _search_esg(company_name)

    if not target_url:
        print(f"Scraper: no ESG URL found for '{company_name}'")
        return None, "scraping_not_found"

    # Step 2: 用 Playwright 直接访问 URL
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            try:
                await page.set_extra_http_headers({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                await page.goto(target_url, timeout=20000, wait_until="domcontentloaded")
                await page.wait_for_timeout(3000)
                content = await page.inner_text("body")
                await browser.close()

                if not content or len(content.strip()) < 50:
                    print(f"Scraper: page empty for '{company_name}'")
                    return None, "scraping_not_found"

                print(f"Scraper: success for '{company_name}' ({len(content)} chars)")
                return content[:8000], None

            except Exception as page_err:
                await browser.close()
                print(f"Scraper: blocked accessing {target_url} — {page_err}")
                return _snippet_or_blocked(company_name, organic_results)

    except Exception as e:
        print(f"Scraper: browser error for '{company_name}' — {e}")
        return _snippet_or_blocked(company_name, organic_results)


def _snippet_or_blocked(company_name: str,
                        organic_results: list[dict]) -> tuple[str | None, str]:
    """Blocked path: try the snippet digest first; fall back to blocked."""
    snippet_content = _assemble_snippet_content(company_name, organic_results)
    if snippet_content:
        print(f"Scraper: snippet fallback for '{company_name}' "
              f"({len(snippet_content)} chars from search excerpts)")
        return snippet_content, SNIPPET_FALLBACK
    return None, "scraping_blocked"
