import asyncio
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env")  # 加载根目录的 .env

from enricher import enrich

async def main():
    company = "Shell"
    print(f"\n=== Testing enricher for: {company} ===\n")
    
    evidence, cdp = await enrich(company)
    
    print(f"\n--- Results ---")
    print(f"Total evidence items: {len(evidence)}")
    print(f"CDP summary: {cdp[:80]}...\n")
    
    for ev in evidence:
        print(f"[{ev['id']}] {ev['kind']} | {ev['org']} | {ev['date']}")
        print(f"  Title: {ev['title'][:60]}")
        print(f"  Quote: {ev['quote'][:80]}...")
        print(f"  URL:   {ev['url'][:60]}")
        print()

asyncio.run(main())