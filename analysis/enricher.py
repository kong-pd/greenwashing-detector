import httpx
import os

# ─── Outlet classification ────────────────────────────────────────────────────

MAJOR_OUTLETS = {
    "reuters", "financial times", "bloomberg", "the guardian",
    "bbc news", "the new york times", "the washington post",
    "associated press", "wall street journal", "ft", "bloomberg businessweek",
    "the economist", "le monde", "der spiegel", "nikkei",
}

def _is_major_outlet(outlet_name: str) -> bool:
    return outlet_name.strip().lower() in MAJOR_OUTLETS


# ─── Quote extraction ─────────────────────────────────────────────────────────

def _extract_quote(article: dict) -> str | None:
    """
    Extract the best available quote from a NewsAPI article.
    Priority: description → content excerpt → title.
    Returns None if nothing meets the minimum length.
    """
    MIN_LEN = 20
    MAX_LEN = 300

    candidates = [
        article.get("description") or "",
        (article.get("content") or "")[:MAX_LEN],
        article.get("title") or "",
    ]

    for candidate in candidates:
        candidate = candidate.strip()
        # NewsAPI appends "[+N chars]" to truncated content — strip it
        if "[+" in candidate:
            candidate = candidate[:candidate.index("[+")].strip()
        if len(candidate) >= MIN_LEN:
            return candidate[:MAX_LEN]

    return None


# ─── Evidence assembly ────────────────────────────────────────────────────────

def _build_evidence_item(idx: int, article: dict) -> dict | None:
    """
    Convert a single NewsAPI article into a structured evidence object.
    Returns None if the article does not meet quality thresholds.
    """
    quote = _extract_quote(article)
    if not quote:
        return None

    url = article.get("url") or ""
    if not url or url == "https://removed.com":
        return None

    org = (article.get("source") or {}).get("name") or "Unknown"
    date_raw = article.get("publishedAt") or ""
    date = date_raw[:10] if date_raw else "Unknown"

    return {
        "id":     f"E-{str(idx + 1).zfill(2)}",
        "kind":   "News",
        "title":  (article.get("title") or "").strip(),
        "org":    org,
        "date":   date,
        "url":    url,
        "quote":  quote,
        "weight": None,   # assigned by AI in analyzer.py
    }


# ─── NewsAPI fetch ────────────────────────────────────────────────────────────

async def fetch_news(company_name: str) -> list[dict]:
    """
    Query NewsAPI for ESG-related articles about the company.
    Returns a list of structured evidence objects (weight = None).
    Returns [] on any failure — analysis is never blocked.
    """
    api_key = os.environ.get("NEWS_API_KEY")
    if not api_key:
        print("NewsAPI: no API key configured")
        return []

    params = {
        "q":        f"{company_name} greenwashing OR sustainability OR ESG",
        "language": "en",
        "sortBy":   "relevancy",
        "pageSize": 10,   # fetch 10, filter down to max 5 quality items
        "apiKey":   api_key,
    }

    async def _fetch() -> list[dict]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://newsapi.org/v2/everything",
                params=params,
                timeout=10,
            )
            res.raise_for_status()
            return res.json().get("articles") or []

    # First attempt
    try:
        articles = await _fetch()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            # Rate limit — wait 1 second and retry once
            import asyncio
            print("NewsAPI: rate limited, retrying in 1s")
            await asyncio.sleep(1)
            try:
                articles = await _fetch()
            except Exception as retry_err:
                print(f"NewsAPI: retry failed — {retry_err}")
                return []
        else:
            print(f"NewsAPI: HTTP error {e.response.status_code}")
            return []
    except Exception as e:
        print(f"NewsAPI: request failed — {e}")
        return []

    # Build evidence objects, skipping low-quality items
    evidence = []
    for article in articles:
        if len(evidence) >= 5:   # cap at 5 evidence items
            break
        item = _build_evidence_item(len(evidence), article)
        if item:
            evidence.append(item)

    print(f"NewsAPI: {len(evidence)} evidence items assembled for '{company_name}'")
    return evidence


# ─── CDP data ─────────────────────────────────────────────────────────────────

def fetch_cdp(company_name: str) -> str:
    """
    CDP data enrichment.
    Currently a stub — returns a placeholder for the AI prompt.
    Full implementation: query CDP CSV dataset by company name / ISIN.
    """
    # TODO: load CDP CSV, match by company_name, return structured record
    return (
        f"CDP data for {company_name}: not yet integrated. "
        "Refer to cdp.net for verified emissions data."
    )


# ─── Main entry point ─────────────────────────────────────────────────────────

async def enrich(company_name: str) -> tuple[list[dict], str]:
    """
    Returns:
        evidence_list  — list of structured evidence objects (weight = None)
        cdp_summary    — string summary of CDP data (or stub message)
    """
    evidence_list = await fetch_news(company_name)
    cdp_summary   = fetch_cdp(company_name)
    return evidence_list, cdp_summary
