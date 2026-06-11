import httpx
import os
import re
from datetime import datetime, timedelta

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_quote(text: str | None) -> str | None:
    MIN_LEN = 20
    MAX_LEN = 300
    if not text:
        return None
    text = text.strip()
    if "[+" in text:
        text = text[:text.index("[+")].strip()
    if len(text) >= MIN_LEN:
        return text[:MAX_LEN]
    return None


def _normalise_serper_date(date_str: str) -> str:
    """Serper 返回相对日期如 '2 days ago'，转为 YYYY-MM-DD。"""
    if not date_str:
        return ""
    now = datetime.now()
    # 尝试解析 "Mar 12, 2024" 格式
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    d = date_str.lower()
    if "hour" in d or "minute" in d or "just now" in d:
        return now.strftime("%Y-%m-%d")
    m = re.search(r"(\d+)\s*day", d)
    if m:
        return (now - timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d")
    m = re.search(r"(\d+)\s*week", d)
    if m:
        return (now - timedelta(weeks=int(m.group(1)))).strftime("%Y-%m-%d")
    m = re.search(r"(\d+)\s*month", d)
    if m:
        return (now - timedelta(days=int(m.group(1)) * 30)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def _reindex(items: list[dict]) -> list[dict]:
    """合并来源后统一重新编号 E-01, E-02..."""
    for i, item in enumerate(items):
        item["id"] = f"E-{str(i + 1).zfill(2)}"
    return items


# ─── Serper News（主要来源）──────────────────────────────────────────────────

async def fetch_news_serper(company_name: str) -> list[dict]:
    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        print("Serper: no API key configured")
        return []

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://google.serper.dev/news",
                headers={
                    "X-API-KEY":    api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "q":   f"{company_name} greenwashing OR sustainability OR ESG",
                    "num": 10,
                    "hl":  "en",
                },
                timeout=10,
            )
            res.raise_for_status()
            articles = res.json().get("news", [])
    except Exception as e:
        print(f"Serper: request failed — {e}")
        return []

    evidence = []
    for article in articles:
        if len(evidence) >= 5:
            break
        url = article.get("link", "")
        if not url or "removed.com" in url:
            continue
        quote = _extract_quote(article.get("snippet")) or _extract_quote(article.get("title"))
        if not quote:
            continue
        evidence.append({
            "id":     f"E-{str(len(evidence) + 1).zfill(2)}",
            "kind":   "News",
            "title":  (article.get("title") or "").strip(),
            "org":    article.get("source", "Unknown"),
            "date":   _normalise_serper_date(article.get("date", "")),
            "url":    url,
            "quote":  quote,
            "weight": None,
        })

    print(f"Serper: {len(evidence)} evidence items for '{company_name}'")
    return evidence


# ─── Guardian News（备用补充）────────────────────────────────────────────────

async def fetch_news_guardian(company_name: str, max_items: int = 3) -> list[dict]:
    api_key = os.environ.get("GUARDIAN_API_KEY")
    if not api_key:
        print("Guardian: no API key configured")
        return []

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://content.guardianapis.com/search",
                params={
                    "q":           f"{company_name} greenwashing sustainability ESG",
                    "api-key":     api_key,
                    "show-fields": "trailText,bodyText",
                    "page-size":   max_items + 3,  # 多取几条备用过滤
                    "order-by":    "relevance",
                },
                timeout=10,
            )
            res.raise_for_status()
            results = res.json().get("response", {}).get("results", [])
    except Exception as e:
        print(f"Guardian: request failed — {e}")
        return []

    evidence = []
    for article in results:
        if len(evidence) >= max_items:
            break
        url = article.get("webUrl", "")
        if not url:
            continue
        fields = article.get("fields", {})
        quote = (
            _extract_quote(fields.get("trailText")) or
            _extract_quote((fields.get("bodyText") or "")[:300]) or
            _extract_quote(article.get("webTitle"))
        )
        if not quote:
            continue
        date_raw = article.get("webPublicationDate", "")
        evidence.append({
            "id":     f"E-{str(len(evidence) + 1).zfill(2)}",
            "kind":   "News",
            "title":  (article.get("webTitle") or "").strip(),
            "org":    "The Guardian",
            "date":   date_raw[:10] if date_raw else "",
            "url":    url,
            "quote":  quote,
            "weight": None,
        })

    print(f"Guardian: {len(evidence)} evidence items for '{company_name}'")
    return evidence


# ─── CDP data（stub）─────────────────────────────────────────────────────────

def fetch_cdp(company_name: str) -> str:
    return (
        f"CDP verified emissions data for {company_name} is not available in this analysis. "
        f"Score the Data Consistency dimension based only on the news evidence and scraped "
        f"content provided above. Do not penalise or adjust the score due to CDP data absence alone."
    )


# ─── Main entry point ─────────────────────────────────────────────────────────

async def enrich(company_name: str) -> tuple[list[dict], str]:
    """
    证据组装 pipeline：
      1. Serper（Google News）— 主要来源，历史覆盖更好
      2. Guardian              — Serper 不足 3 条时自动补充
    最终返回不超过 5 条，ID 统一重新编号。
    """
    # Step 1: Serper 主查询
    evidence = await fetch_news_serper(company_name)

    # Step 2: Guardian 补充（Serper 结果不足时）
    if len(evidence) < 3:
        needed = 5 - len(evidence)
        print(f"Serper returned {len(evidence)} — supplementing with Guardian (need {needed})")
        guardian_items = await fetch_news_guardian(company_name, max_items=needed)
        evidence = evidence + guardian_items

    # 合并去重、上限5条、重新编号
    evidence = _reindex(evidence[:5])

    print(f"enrich: total {len(evidence)} evidence items for '{company_name}'")
    return evidence, fetch_cdp(company_name)