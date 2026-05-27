from playwright.async_api import async_playwright

ESG_KEYWORDS = ["sustainability", "esg", "environment", "carbon", "climate", "green"]


async def scrape(company_name: str) -> tuple[str | None, str | None]:
    """
    Attempt to scrape the company's ESG page.

    Returns:
        (content, fail_reason)

        content     — extracted page text, or None on failure
        fail_reason — None on success, or one of:
                        "scraping_not_found"  — Google returned no relevant ESG link,
                                                or the page had no usable content
                        "scraping_blocked"    — found a URL but access was blocked
                                                (anti-bot, timeout, network error)

    The two fail reasons produce different user-facing messages in the frontend
    so users understand whether to search for the URL themselves or just paste content.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Search for the company's ESG page
            query = f"{company_name} sustainability ESG report"
            await page.goto(f"https://www.google.com/search?q={query}", timeout=15000)
            await page.wait_for_timeout(2000)

            # Find a relevant link from search results
            links = await page.locator("a[href^='https']").all()
            target_url = None
            for link in links[:10]:
                href = await link.get_attribute("href")
                if href and any(kw in href.lower() for kw in ESG_KEYWORDS):
                    target_url = href
                    break

            # No relevant ESG link found in search results
            if not target_url:
                await browser.close()
                print(f"Scraper: no ESG link found for '{company_name}'")
                return None, "scraping_not_found"

            # Found a URL — attempt to access it
            try:
                await page.goto(target_url, timeout=15000)
                await page.wait_for_timeout(2000)
                content = await page.inner_text("body")
                await browser.close()

                if not content or len(content.strip()) < 50:
                    print(f"Scraper: page empty or too short for '{company_name}'")
                    return None, "scraping_not_found"

                # Truncate to avoid exceeding token limits
                print(f"Scraper: success for '{company_name}' ({len(content)} chars)")
                return content[:3000], None

            except Exception as page_err:
                # URL found but page access failed — anti-bot or network issue
                await browser.close()
                print(f"Scraper: blocked accessing {target_url} — {page_err}")
                return None, "scraping_blocked"

    except Exception as e:
        # Outer exception — Google search itself failed or browser launch failed
        print(f"Scraper: outer failure for '{company_name}' — {e}")
        return None, "scraping_blocked"
