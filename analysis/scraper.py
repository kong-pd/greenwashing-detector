from playwright.async_api import async_playwright

ESG_KEYWORDS = ["sustainability", "esg", "environment", "carbon", "climate", "green"]

async def scrape(company_name: str) -> str | None:
    """Attempt to scrape the company's ESG page. Returns text content or None."""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Search for the company's ESG page
            query = f"{company_name} sustainability ESG report"
            await page.goto(f"https://www.google.com/search?q={query}", timeout=15000)
            await page.wait_for_timeout(2000)

            # Find a relevant link from results
            links = await page.locator("a[href^='https']").all()
            target_url = None
            for link in links[:10]:
                href = await link.get_attribute("href")
                if href and any(kw in href.lower() for kw in ESG_KEYWORDS):
                    target_url = href
                    break

            if not target_url:
                await browser.close()
                return None

            await page.goto(target_url, timeout=15000)
            await page.wait_for_timeout(2000)
            content = await page.inner_text("body")
            await browser.close()

            # Truncate to avoid exceeding token limits
            return content[:3000] if content else None

    except Exception as e:
        print(f"Scraper failed: {e}")
        return None
