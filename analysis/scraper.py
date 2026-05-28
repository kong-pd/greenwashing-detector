import httpx
import os
from playwright.async_api import async_playwright

ESG_KEYWORDS = ["sustainability", "esg", "environment", "carbon", "climate", "green"]


async def _search_esg_url(company_name: str) -> str | None:
    """用 Serper API 搜索公司的 ESG 页面 URL"""
    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        print("Serper: no API key configured")
        return None

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "q": f"{company_name} sustainability ESG report site",
                    "num": 10,
                },
                timeout=10,
            )
            res.raise_for_status()
            results = res.json().get("organic", [])
    except Exception as e:
        print(f"Serper search failed: {e}")
        return None

    for result in results:
        url = result.get("link", "")
        if url and any(kw in url.lower() for kw in ESG_KEYWORDS):
            print(f"Serper found ESG URL: {url}")
            return url

    # 没找到含关键词的 URL，用第一个结果
    if results:
        url = results[0].get("link", "")
        print(f"Serper fallback URL: {url}")
        return url

    return None


async def scrape(company_name: str) -> tuple[str | None, str | None]:
    """
    用 Serper 找到 ESG 页面 URL，再用 Playwright 抓取内容。
    """
    # Step 1: 用 Serper 找 URL
    target_url = await _search_esg_url(company_name)

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
                return None, "scraping_blocked"

    except Exception as e:
        print(f"Scraper: browser error for '{company_name}' — {e}")
        return None, "scraping_blocked"