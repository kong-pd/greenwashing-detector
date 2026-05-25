import httpx
import os

async def enrich(company_name: str) -> tuple[str, str]:
    """Returns (news_summary, cdp_summary)."""
    news = await fetch_news(company_name)
    cdp = fetch_cdp(company_name)
    return news, cdp

async def fetch_news(company_name: str) -> str:
    try:
        api_key = os.environ.get("NEWS_API_KEY")
        if not api_key:
            return "No data"
        async with httpx.AsyncClient() as client:
            res = await client.get("https://newsapi.org/v2/everything", params={
                "q": f"{company_name} greenwashing OR sustainability OR ESG",
                "language": "en",
                "sortBy": "relevancy",
                "pageSize": 5,
                "apiKey": api_key,
            }, timeout=10)
        articles = res.json().get("articles", [])
        if not articles:
            return "No relevant news found"
        summaries = [
            f"- {a['title']} ({a['source']['name']}, {a['publishedAt'][:10]})"
            for a in articles
        ]
        return "\n".join(summaries)
    except Exception as e:
        print(f"NewsAPI failed: {e}")
        return "No data"

def fetch_cdp(company_name: str) -> str:
    # TODO: integrate CDP CSV dataset before demo
    return "CDP data not yet integrated"
