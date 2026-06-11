# 重建手册 C v3(新手版)— 分析服务

> **给谁看**:第一次写"会调 AI 的后台服务"的你。Python 基础语法即可,async、爬虫、调大模型都从零讲。
> **你负责**:`analysis/` 目录——真正"干活"的服务:抓网页、搜新闻、调 AI 打分、把结果写回数据库。你与世界只有两个接口:被 B 触发的 `POST /run`、被 B 回查的 `GET /result/{id}`。
> **两条产品原则(你的一切设计都为它们服务)**:① **证据由代码组装,AI 只判断"相关不相关"**——这样报告里每个链接都是真的,AI 想编也没机会;② **降级要说出口**——抓不到整页就用搜索摘要,但必须在报告上明明白白标出来。
> **节奏与参考答案的用法**:同 A/B 册。

---

## Phase 0 — 环境与"受理即回"(M0,约 1 小时)

⌨️ 起手式(venv 的原理见 B 册 Phase 0.1,这里直接做):
```bash
mkdir analysis && cd analysis
python3 -m venv venv && source venv/bin/activate
pip install fastapi "uvicorn[standard]" python-dotenv httpx supabase playwright google-generativeai
playwright install chromium      # 下载一个无头浏览器(约 150MB,抓网页用)
pip freeze > requirements.txt
cp ../backend/.env.example .env  # 再追加你自己的钥匙:
```
`.env` 追加(值填你在第 0 册注册到的):
```
GEMINI_API_KEY=...
GROQ_API_KEY=...
SERPER_API_KEY=...
GUARDIAN_API_KEY=...
USE_MOCK=false
```

🎯 第一个端点:`/run` 必须**收到任务立刻回话**,活儿放后台干。

🧠 **async 两分钟**:`async def` 定义的函数可以在等网络时"让位"给别的活;`await` = "在这等结果,但别堵别人";`asyncio.create_task(f())` = "把 f 扔到后台跑,我先回话"。B 触发你时只给 5 秒超时——**受理和执行必须分离**,不然 B 会以为你死了。

⌨️ `analysis/main.py`:
```python
import asyncio, os
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

class RunRequest(BaseModel):
    job_id: str
    company_name: str
    manual_content: str | None = None

@app.get("/health")
def health():
    return {"status": "ok", "service": "analysis"}

@app.post("/run")
async def run(req: RunRequest):
    asyncio.create_task(process(req))      # 扔后台
    return {"status": "started"}           # 立刻回话(B 只等这句)

async def process(req: RunRequest):
    print(f"[{req.job_id}] start: {req.company_name}")
    # Phase 1 起,真正的四步流水线长在这里
```
⌨️ 跑:`uvicorn main:app --port 8001 --reload`,验:`curl localhost:8001/health`。

✅ **M0 过关**:health ok;`curl -X POST localhost:8001/run -H 'Content-Type: application/json' -d '{"job_id":"t1","company_name":"Acme"}'` **立刻**返回 started,且终端打印 start 行。截图发群。
📖 参考:`analysis/main.py` 顶部。

---

## Phase 1 — Mock 流水线:先让全线通电(M1,约半天)

🎯 先不抓网页不调 AI,用一份写死的"假结果"把【收任务 → 更新进度 → 写结果进数据库】走通。B 的轮询能看到你写的 completed,M1 三机联调就成了。

### 1.1 写库的三个小函数

⌨️ `main.py` 加:
```python
from supabase import create_client

def get_db():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

def update_step(job_id: str, step: str):
    """更新进度文案(前端轮询时显示的那行字)。写失败只打日志——进度丢了不致命。"""
    try:
        get_db().table("analysis_jobs").update({"step": step}).eq("id", job_id).execute()
        print(f"[{job_id}] step → {step}")
    except Exception as e:
        print(f"[{job_id}] update_step failed (non-critical): {e}")

def save_failed(job_id: str, reason: str):
    """失败收尾。reason 是给前端看的'病名',只能用这几个值(团队契约):
       scraping_not_found / scraping_blocked / analysis_failed"""
    try:
        get_db().table("analysis_jobs").update(
            {"status": "failed", "fail_reason": reason}).eq("id", job_id).execute()
        print(f"[{job_id}] failed — {reason}")
    except Exception as e:
        print(f"[{job_id}] save_failed failed: {e}")

def save_result(job_id: str, result: dict, company_name: str = ""):
    """成功收尾:写 analysis_jobs 一行 + analysis_flags 多行。
    字段名必须和 wiki 06 一字不差——B 的 get_job 只认这些列。"""
    from datetime import datetime, timezone
    try:
        db = get_db()
        db.table("analysis_jobs").update({
            "status": "completed",
            "score": result.get("score"),
            "risk_level": result.get("risk_level"),
            "summary": result.get("summary"),
            "sources": result.get("evidence") or [],            # 证据对象数组存进 JSONB
            "dimension_scores": result.get("dimension_scores") or {},
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()
        for flag in result.get("flags") or []:
            t = flag.get("type", "")
            db.table("analysis_flags").insert({
                "job_id": job_id, "type": t,
                "severity": flag.get("severity") or (         # 每条旗子必须有严重度
                    "high" if t in ("Data Contradiction", "Negative News") else
                    "medium" if t in ("Vague Claims", "Lack of Certification") else "low"),
                "description": flag.get("description", ""),
                "source": flag.get("source", ""),
            }).execute()
        print(f"[{job_id}] saved — score={result.get('score')}")
    except Exception as e:
        print(f"[{job_id}] save_result DB write failed: {e}")
```

### 1.2 假结果 + 四步流水线骨架

⌨️
```python
MOCK_RESULT = {
    "score": 72, "risk_level": "High Risk",
    "summary": "[MOCK] Pre-defined demo result.",
    "dimension_scores": {"specificity": 15, "data_consistency": 16,
        "third_party_certification": 13, "negative_news": 15, "greenwashing_language": 13},
    "flags": [
        {"type": "Vague Claims", "description": "[MOCK] vague", "source": "mock"},
        {"type": "Data Contradiction", "description": "[MOCK] contradiction", "source": "mock"},
        {"type": "Greenwashing Language", "description": "[MOCK] language", "source": "mock"},
    ],
    "evidence": [],
}

async def process(req: RunRequest):
    try:
        # ① 拿内容(用户手动粘贴的优先;现在先假装抓到了)
        update_step(req.job_id, "Fetching company content...")
        content = req.manual_content or "[mock page content] " * 20

        # ② 组装证据(Phase 3 实装)
        update_step(req.job_id, "Gathering external evidence...")
        evidence = []

        # ③ AI 打分(Phase 4 实装;现在直接用假结果)
        update_step(req.job_id, "Analysing with AI...")
        result = {**MOCK_RESULT, "evidence": evidence}

        # ④ 落库
        save_result(req.job_id, result, company_name=req.company_name)
    except Exception as e:
        print(f"[{req.job_id}] pipeline crashed: {e}")
        save_failed(req.job_id, "analysis_failed")    # 任何意外都有交代,绝不静默
```

👀 验收(和 B 一起):B 那边 `POST /api/analyze {"company_name":"Acme"}` → 等几秒 → B 轮询 `/api/report/{job_id}` 看到 completed + 72 分。〔联调〕在群里喊:"mock 公司已能 completed,去轮!"

✅ **M1 过关**。A 输入任意名字能看到这份假报告 = 三机首次握手成功,值得合影。
📖 参考:`analysis/main.py` 的 `process` 与三个 save 函数。

---

## Phase 2 — 真实抓取:两硬一软三态(M2 上半,约一天)

🎯 用 Serper(Google 搜索 API)找到公司的 ESG 页面网址 → 用 Playwright(无头浏览器)打开抓正文。**抓不到时分三种结局**:

```
找不到链接/页面空        → (None, "scraping_not_found")   → 前端请用户粘贴内容
被反爬挡住,但搜索摘要够厚 → (摘要拼接文本, "scraping_snippet_fallback") → 降级继续分析!
被挡且摘要太薄            → (None, "scraping_blocked")     → 前端请用户粘贴内容
```

🧠 **为什么有"软"态**:搜索的时候 Serper 已经把每条结果的**摘要(snippet)**给你了。整页抓不到就把摘要拼起来分析,总比直接让用户手动粘贴体验好——但有两条铁律:**摘要拼起来不足 200 字就老实承认 blocked**(硬规则③:软态永不顶掉硬态,不然用户连"手动粘贴"的机会都被剥夺);**用了摘要必须标记出来**(`fail_reason` 写上标记串,B 透传、A 挂横幅)。

⌨️ 新建 `analysis/scraper.py`:
```python
import os, httpx
from playwright.async_api import async_playwright

ESG_KEYWORDS = ["sustainability", "esg", "environment", "carbon", "climate", "green"]
SNIPPET_MIN_CHARS = 200
SNIPPET_FALLBACK = "scraping_snippet_fallback"   # 跨团队契约串,一个字都不能差

async def _search_esg(company_name: str):
    """Serper 搜 ESG 页。返回 (最佳网址, 全部搜索结果)——结果留着,被挡时摘要救命。"""
    key = os.environ.get("SERPER_API_KEY")
    if not key:
        return None, []
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post("https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": f"{company_name} sustainability ESG report site", "num": 10},
                timeout=10)
            res.raise_for_status()
            results = res.json().get("organic", [])
    except Exception as e:
        print(f"Serper search failed: {e}")
        return None, []
    for r in results:                       # 优先带 ESG 关键词的链接
        url = r.get("link", "")
        if url and any(kw in url.lower() for kw in ESG_KEYWORDS):
            return url, results
    return (results[0].get("link", ""), results) if results else (None, [])

def _assemble_snippet_content(company_name: str, results: list[dict]):
    """把搜索摘要拼成'降级正文'。太薄(<200字)→ None,让 blocked 路径接管。"""
    parts = [f"{r.get('title','').strip()}: {r['snippet'].strip()}"
             for r in results if r.get("snippet", "").strip()]
    if not parts:
        return None
    content = (f"[Search-snippet digest for {company_name} — full page was "
               f"inaccessible; the following are search result excerpts]\n\n"
               + "\n\n".join(parts))
    return content[:8000] if len(content) >= SNIPPET_MIN_CHARS else None

def _snippet_or_blocked(company_name, organic_results):
    snippet = _assemble_snippet_content(company_name, organic_results)
    if snippet:
        print(f"Scraper: snippet fallback ({len(snippet)} chars)")
        return snippet, SNIPPET_FALLBACK
    return None, "scraping_blocked"

async def scrape(company_name: str):
    url, organic = await _search_esg(company_name)
    if not url:
        return None, "scraping_not_found"
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)   # headless=不弹窗口
            page = await browser.new_page()
            try:
                await page.set_extra_http_headers({"User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
                await page.goto(url, timeout=20000, wait_until="domcontentloaded")
                await page.wait_for_timeout(3000)              # 等 3 秒让 JS 渲染
                content = await page.inner_text("body")        # 取整页可见文字
                await browser.close()
                if not content or len(content.strip()) < 50:
                    return None, "scraping_not_found"
                return content[:8000], None                    # 截 8000 字,省 AI 的token
            except Exception as e:
                await browser.close()
                print(f"Scraper blocked: {e}")
                return _snippet_or_blocked(company_name, organic)
    except Exception as e:
        print(f"Scraper browser error: {e}")
        return _snippet_or_blocked(company_name, organic)
```
`main.py` 的 `process` 第①步换成真的(**注意中间态的接法**):
```python
from scraper import scrape, SNIPPET_FALLBACK

def mark_degraded(job_id: str, reason: str):
    """降级标记:只写 fail_reason,status 不动,流水线继续。
    save_result 不碰 fail_reason 列 → 标记在 completed 后依然活着 → A 的横幅有据。"""
    try:
        get_db().table("analysis_jobs").update({"fail_reason": reason}).eq("id", job_id).execute()
        print(f"[{job_id}] degraded — {reason} (pipeline continues)")
    except Exception as e:
        print(f"[{job_id}] mark_degraded failed: {e}")

# process() 第①步:
if req.manual_content:
    content = req.manual_content
else:
    content, fail_reason = await scrape(req.company_name)
    if not content:
        save_failed(req.job_id, fail_reason or "scraping_not_found"); return
    if fail_reason == SNIPPET_FALLBACK:
        mark_degraded(req.job_id, fail_reason)     # 标记,但继续往下走!
```

👀 自测:`USE_MOCK` 先保持 false 没关系——拿一家真实公司(比如 "Patagonia")跑 `/run`,看终端打印抓到多少字;再故意把 SERPER_API_KEY 改错,确认走 not_found;(snippet 态不好手动复现,Phase 6 用测试钉它)。

✅ 过关:三种 return 形状都能在代码里指出来;blocked 时终端能看到"摘要太薄→blocked"或"snippet fallback"二选一。commit + merge。
📖 参考:`analysis/scraper.py` 全文。

---

## Phase 3 — enricher:代码组装证据(M2 下半,约半天)

🎯 用 Serper News + Guardian API 搜这家公司的 ESG 新闻,**由你的代码**组装成结构化"证据对象"(AI 只负责后面判断每条的相关度)。这是防 AI 编造引用的根本设计。

⌨️ 新建 `analysis/enricher.py`,要点清单(结构都是"调 API → 整理字段",照清单写):
1. **Serper News**:`POST https://google.serper.dev/news`,q = `"{company} greenwashing OR sustainability OR ESG"`,取前 5 条,过滤没链接的。
2. **Guardian 补位**:Serper 不足 3 条时,调 `https://content.guardianapis.com/search?q=...&api-key=...` 补到 5。
3. 每条整理成 **11 字段证据对象**:
```python
{"id": "E-01", "kind": "News", "title": 标题, "org": 媒体名, "date": "YYYY-MM-DD",
 "url": 链接, "quote": 摘要节选(20~300字,剥掉"[+123 chars]"尾巴),
 "weight": None}   # weight 和三个分量 Phase 5 再算
```
4. **日期归一(有血泪)**:Serper 给的日期五花八门("Mar 12, 2024"、"2 days ago")。写 `_normalise_serper_date` 转成 ISO;**解析不出就给空串 `""`,绝对不要写 "Unknown"** —— 历史 bug:前端拿 "Unknown" 做字符串比较,`"U" > "2"`,未知日期全被当成"最新"。
5. 统一编号 E-01、E-02…(`_reindex` 函数),上限 5 条。
6. **CDP stub**:再返回一段固定文字给 AI 看:"CDP 数据暂缺,**不得因为缺数据扣 Data Consistency 分**"——没有这句,AI 会自作主张惩罚。

`process` 第②步接上:`evidence, cdp_note = await enrich(req.company_name)`。

👀 自测:单独写个 5 行小脚本调 `enrich("Shell")` 打印结果,逐条检查 11 字段齐、日期是 ISO 或空串。

✅ **M2 过关**(和 A/B 一起):真公司全流程 + 三种失败演给彼此看。
📖 参考:`analysis/enricher.py`(`_normalise_serper_date` / `_extract_quote` 直接抄,是纯字符串体操)。

---

## Phase 4 — AI 链:打不死的打分器(M3,约一天)

🎯 调 AI 给内容打分。**一家 AI 会挂(配额/抽风),所以排九层**,从免费到付费到兜底,一层失败换下一层:

```
① USE_MOCK 开关 → ② Gemini 2.5 Flash-Lite → ③ Gemini Flash → ④ Gemini Pro
→ ⑤ Groq Llama 3.3 70B(另一家公司,不会一起挂) → ⑥ Groq 3.1 8B
→ ⑦ Claude(可选付费) → ⑧ local_cache.json(五家公司离线答案) → ⑨ 通用 MOCK
```

⌨️ 新建 `analysis/analyzer.py`。三块核心:

**(a) prompt 与解析**:system prompt **从 wiki `08-Prompt-Design` 整段复制,一字不改**(里面定义了 5 维评分细则、证据权重区间、输出 JSON 格式)。AI 经常把 JSON 包在 \`\`\` 围栏里,解析前剥掉:
```python
import json
def _parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    return json.loads(t.strip())
```

**(b) 一层调用长这样(其余层是同款换皮)**:
```python
def _call_gemini(model_name: str, system_prompt: str, user_prompt: str):
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(model_name, system_instruction=system_prompt)
    resp = model.generate_content(user_prompt)
    return _parse_json(resp.text)
```
**错误要分类**(不分类,半夜出问题你不知道该换钥匙还是该睡觉等配额):钥匙错(401/invalid key)→ 打 `[CONFIG_ERROR]` 并**跳过这家的所有型号**;配额/超时(429/503)→ `[TRANSIENT]`,试下一层;JSON 坏 → `[PARSE_ERROR]`,试下一层。主函数 `analyze(...)` 就是一个 for 循环按链序逐层 try。

**(c) 结果加固(别信 AI 的自我汇报)**:
```python
def _derive_risk_level(score: int) -> str:
    return "Low Risk" if score <= 30 else "Medium Risk" if score <= 60 else "High Risk"

# _process_result 里:
score = max(0, min(100, int(round(float(raw.get("score") or 0)))))   # 夹回 0~100
risk = raw.get("risk_level")
if risk not in ("Low Risk", "Medium Risk", "High Risk") or risk != _derive_risk_level(score):
    risk = _derive_risk_level(score)        # 标签和分数打架时,以分数派生为准
```
**Layer-8 本地缓存有个坑**:命中后要补字段时,**先 `copy.deepcopy(cached)` 再改** —— 直接改会污染内存里的缓存本体,第二次查同一家公司数据就串味了(真实 bug)。

✅ 自测:`USE_MOCK=false` + 正确的 GEMINI key 跑一次真分析;然后把 GEMINI key 改错重跑——日志应出现 `[CONFIG_ERROR]` 并落到 Groq 层,**报告照出**。这就是"打不死"。
📖 参考:`analysis/analyzer.py`(九层链 + `_process_result` 完整版)。

---

## Phase 4.5 — relay:数据库挂了,结果也不能丢(M3 收尾,约 2 小时)

🧠 场景:数据库挂了 → 你算完 `save_result` 写不进去 → B 读不到 → 用户白等。方案:**每个结果先在你自己内存里存一份**,开个 `GET /result/{job_id}` 让 B 来取。"先写内存,再写数据库"——顺序不能反,反了崩在中间就两头空。

⌨️ `main.py` 加:
```python
_RELAY_MAX = 50
_RELAY: dict[str, dict] = {}
_RELAY_ORDER: list[str] = []          # 记录先后,满了踢最老的(FIFO)

def _relay_put(job_id: str, record: dict):
    if job_id not in _RELAY:
        _RELAY_ORDER.append(job_id)
        while len(_RELAY_ORDER) > _RELAY_MAX:
            _RELAY.pop(_RELAY_ORDER.pop(0), None)
    _RELAY[job_id] = {**_RELAY.get(job_id, {}), **record}

@app.get("/result/{job_id}")
def relay_result(job_id: str):
    return _RELAY.get(job_id) or {"status": "unknown", "job_id": job_id}
```
然后给四个函数都加上"先写内存"(各一行):
- `update_step` 开头:`_relay_put(job_id, {"id": job_id, "status": "processing", "step": step})`
- `save_failed` 开头:`_relay_put(job_id, {"id": job_id, "status": "failed", "fail_reason": reason})`
- `mark_degraded` 开头:`_relay_put(job_id, {"fail_reason": reason})`
- `save_result` 开头(完整 job 形状,B 拿到能直接用):
```python
_relay_put(job_id, {"id": job_id, "company_name": company_name, "status": "completed",
    "step": None, "score": result.get("score"), "risk_level": result.get("risk_level"),
    "summary": result.get("summary"), "sources": result.get("evidence") or [],
    "dimension_scores": result.get("dimension_scores") or {},
    "completed_at": completed_at, "analysis_flags": result.get("flags") or []})
```

👀〔联调 · 断库演习〕和 B 一起:两人都把 `.env` 的 SUPABASE_URL 改成 placeholder → B 发起新公司分析 → 你日志出现 "DB write failed" → B 的轮询**依然拿到 completed**(他的日志出现 "relay hit")。演完改回。

✅ **M3 过关**:演习成功 = 这个系统"打不死"宣告成立。
📖 参考:`analysis/main.py` 的 relay 段。

---

## Phase 5 — 权重三分量:把"凭什么 0.87"变成可以点开的答案(M5,约一天)

🎯 每条证据的最终权重不再是一个黑箱数,而是三个分量的加权:

```
weight = 夹回区间( 0.45×可靠度 + 0.20×新鲜度 + 0.35×相关度 )

可靠度 reliability:按证据类型给底分 Filing .90 / Database .86 / News .60 / Document .55 / Linguistic .45
                    News 且媒体是一线大社(Reuters/FT/Bloomberg/Guardian/BBC/AP/WSJ/NYT)→ 保底 0.85
新鲜度 recency:    距今 ≤90天→.95  ≤365→.80  ≤730→.65  更老或没日期→.50
相关度 relevance:  AI 给的 weight(它判断"这条多直接支持/反驳该声明");AI 没给→区间中点
区间 band:        Filing(.85,.95) Database(.80,.92) News(.40,.80) Document(.45,.65) Linguistic(.30,.55)
```
🧠 分工哲学一句话:**AI 只判断"相关不相关"(它擅长的语义活),可靠度和新鲜度由代码硬算(可复现、可审计)**。公式的权威定义在 wiki `10-Evidence-Pipeline`,你的代码必须和它逐字一致。

⌨️ `analyzer.py` 加(完整抄写):
```python
from datetime import date

WEIGHT_BANDS = {"Filing": (0.85, 0.95), "Database": (0.80, 0.92),
                "News": (0.40, 0.80), "Document": (0.45, 0.65), "Linguistic": (0.30, 0.55)}
KIND_RELIABILITY_BASE = {"Filing": 0.90, "Database": 0.86, "News": 0.60,
                         "Document": 0.55, "Linguistic": 0.45}
TIER1_OUTLETS = {"reuters", "financial times", "ft", "bloomberg", "the guardian",
                 "guardian", "bbc", "associated press", "ap", "wall street journal",
                 "wsj", "the new york times", "new york times", "nyt"}

def _reliability(kind, org):
    base = KIND_RELIABILITY_BASE.get(kind, 0.60)
    if kind == "News" and (org or "").strip().lower() in TIER1_OUTLETS:
        base = max(base, 0.85)            # 一线大社保底——这是"出处可靠"的工程化表达
    return round(base, 2)

def _recency(date_str):
    try:
        d = date.fromisoformat((date_str or "").strip())
    except Exception:
        return 0.50                        # 空串/烂格式 → 中性 0.5(绝不奖励未知)
    days = (date.today() - d).days
    return 0.95 if days <= 90 else 0.80 if days <= 365 else 0.65 if days <= 730 else 0.50

def _clamp(kind, w):
    lo, hi = WEIGHT_BANDS.get(kind, (0.0, 1.0))
    return round((lo + hi) / 2, 2) if w is None else round(max(lo, min(hi, float(w))), 2)

def _normalise_evidence(items):
    out = []
    for it in items:
        kind = it.get("kind", "News")
        ai_w = it.get("weight")
        relevance = round(float(ai_w), 2) if isinstance(ai_w, (int, float)) else _clamp(kind, None)
        rel, rec = _reliability(kind, it.get("org", "")), _recency(it.get("date", ""))
        out.append({**{k: it.get(k, "") for k in
                      ("id", "kind", "title", "org", "date", "url")},
                    "quote": (it.get("quote") or "")[:300],
                    "reliability": rel, "recency": rec, "relevance": relevance,
                    "weight": _clamp(kind, 0.45*rel + 0.20*rec + 0.35*relevance)})
    return sorted(out, key=lambda x: x["weight"], reverse=True)   # 按权重降序
```
在 `_process_result` 里:AI 返回的 evidence(或 AI 漏了时的输入证据)统一过 `_normalise_evidence` —— **三个分量从此长在每条证据上**,经 B 透传,在 A 的抽屉里变成三条 bar。

### 5.2 喂满 local_cache.json(全队的演示底气)

🎯 Layer-8 的离线答案册:五家公司(shell/h&m/patagonia/tesla/bp)各一份完整结果。**别手敲 JSON**,写个一次性脚本 `build_cache.py`:对每家公司列 4–5 条证据素材(类型/标题/机构/日期/链接/引文/相关度),用上面同一套公式算出三分量与 weight,断言全部落在区间内,再写文件。两条内容纪律:
- 证据里的机构要和该公司 flags 提到的机构**对得上**(A 的"点旗子跳证据"靠文字匹配,对不上就跳空);
- 链接用机构**官网门户级**地址(asa.org.uk、sciencebasedtargets.org…),**不编造深层文章网址**——演示数据也要诚实。

✅ **M5 过关**:断库查 Shell,B 转给 A,三条 bar 显示 0.90 / 0.95 / 0.85;全队互相提问"0.87 怎么来的",你能口算给他们听。
📖 参考:`analysis/analyzer.py` 权重段、`analysis/local_cache.json`(看 shell 的第一条找感觉)、交付包里的 `build_cache_evidence.py`。

---

## Phase 6 — 测试:FakeDB 把整条流水线钉死(M6,约半天)

🧠 测试 `process()` 难点:它要写数据库。办法是**假数据库(FakeDB)**——一个"记账本"对象,长得像 supabase client(有 `.table().update().eq().execute()` 这串方法),但只把每次调用记下来。测试最后翻账本断言"写了什么"。这招叫 **monkeypatch**(运行时偷换 `get_db`)。

⌨️ `analysis/tests/test_pipeline_integration.py` 核心三段(完整结构照参考实现抄,这里看懂原理):
```python
class _FakeTable:
    def __init__(self, store, name): self.store, self.name, self._p = store, name, None
    def update(self, payload): self._p = ("update", payload); return self
    def insert(self, payload): self.store.setdefault(self.name, []).append(("insert", payload, None)); return self
    def eq(self, col, val):
        if self._p:
            self.store.setdefault(self.name, []).append((*self._p, (col, val))); self._p = None
        return self
    def execute(self): return self

class FakeDB:
    def __init__(self): self.store = {}
    def table(self, name): return _FakeTable(self.store, name)

def test_pipeline_completes_and_writes_contract(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(analysis_main, "get_db", lambda: db)      # 偷换数据库
    asyncio.run(process(RunRequest(job_id="it-001", company_name="Acme",
                                   manual_content="We are committed..." * 10)))
    final = [p for op, p, _ in db.store["analysis_jobs"] if op == "update"][-1]
    assert final["status"] == "completed"
    for col in ("score", "risk_level", "summary", "sources", "dimension_scores"):
        assert col in final            # 这就是"写库形状"契约的自动看门人
```
照这个味道补齐(参考实现共 50 条):权重公式逐项(保底不漏到非 News、90/91 天边界、极端输入永在区间内)、snippet 三态与 200 字阈值、`_parse_json` 剥围栏、日期归一、relay 双态与 50 条上限、两种硬失败、AI 全挂→analysis_failed。

⌨️ 跑:
```bash
USE_MOCK=true SUPABASE_URL=https://placeholder.supabase.co \
SUPABASE_ANON_KEY=placeholder pytest tests/ -q
```
👀 全绿。✅ **M6 过关**:50 passed 截图发群。
📖 参考:`analysis/tests/` 三个文件。

---

## 症状速查

| 症状 | 多半是 | 去哪修 |
|------|--------|--------|
| B 说触发你超时 | /run 里同步干活了 | Phase 0:create_task 受理即回 |
| snippet 报告顶掉了手动输入 | 200 字阈值没把关 / 标记串拼错 | Phase 2 铁律 |
| completed 后 A 的横幅消失 | save_result 把 fail_reason 也 update 了 | mark_degraded 注释:save_result 不碰该列 |
| 同一公司第二次查数据变样 | Layer-8 没 deepcopy | Phase 4(c) |
| A 三条 bar 全 est. | `_normalise_evidence` 输出丢了分量 | Phase 5 代码——分量是输出的一部分 |
| 未知日期被当成最新 | 给了 "Unknown" | Phase 3 第 4 条:空串 |
| 换错钥匙后整链卡死重试 | 钥匙错也按"临时故障"重试 | Phase 4(b):CONFIG_ERROR 直接弃该家 |

## 写给你的最后一段话

你会发现这一册一半篇幅都在写"失败时怎么办"。这不是悲观,是这类产品的本质:**模型、搜索、数据库、网络,每一环都会在最坏的时刻掉链子;而用户只看见"出了报告"或"白屏"**。九层链、三态抓取、relay、deepcopy——每一个都是给某次具体故障准备的降落伞。等到断库演习成功那天,你就会懂:让系统打不死,比让它聪明,难得多,也酷得多。
