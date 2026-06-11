# 重建手册 B v3(新手版)— 后端与数据库

> **给谁看**:第一次写后端的你。Python 会基础语法即可,FastAPI / 数据库 / 测试都从零讲。
> **你负责**:`backend/` 目录 + Supabase 数据库。你是"形状守门员":不管数据从哪来(数据库/本地缓存/C 的内存),从你这出去的 JSON 永远是同一个形状。
> **节奏**:每步「🎯 做什么 → ⌨️ 敲这个 → 👀 应该看到 → 🧠 原理一分钟 → ⚠️ 陷阱 → ✅ 过关」。每过一个 Phase 走一次 Git 六步循环。
> **参考答案**:📖 标注路径;先自己写,卡 20 分钟再翻。

---

## Phase 0 — 环境与 Hello World(M0 上半,约 1 小时)

### 0.1 虚拟环境:给项目一个独立的 Python 房间

🧠 不同项目要不同版本的包,全装系统里会打架。**虚拟环境(venv)**= 本项目专属的 Python 小房间,包都装房间里。

⌨️ 在仓库根:
```bash
mkdir backend && cd backend
python3 -m venv venv            # 造房间(会出现一个 venv/ 文件夹)
source venv/bin/activate        # 进房间(Windows: venv\Scripts\activate)
```
👀 命令行最前面出现 `(venv)` —— **以后每次开新终端干后端的活,先敲这句进房间**。忘了进房间,就会遇到经典报错 `ModuleNotFoundError`。

⌨️ 装包(pip 是 Python 的包管理器):
```bash
pip install fastapi "uvicorn[standard]" python-dotenv httpx supabase weasyprint pytest pytest-asyncio
pip freeze > requirements.txt   # 把"我装了什么"写成清单,队友照单复原:pip install -r requirements.txt
```
⚠️ WeasyPrint(生成 PDF 的库)在 Linux 需要系统库:`sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0`;Mac:`brew install pango`;Windows 建议跟它的官方文档装 GTK 运行时(或者这一步留到 Phase 4 再说,不影响前面)。

### 0.2 第一个接口

🎯 跑起一个只有 `/health` 的服务,理解"路由"。

⌨️ 新建 `backend/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()          # 启动时读 .env 文件,把里面的键值放进环境变量

app = FastAPI()

# CORS:允许哪些网页来调我。开发期先全放行,文件里留个 TODO 上线收紧。
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])  # TODO: 上线改成前端域名

@app.get("/health")                 # 装饰器:把下面的函数挂到 GET /health 上
def health():
    return {"status": "ok"}        # 返回字典,FastAPI 自动转成 JSON
```
⌨️ 启动(uvicorn 是跑 FastAPI 的服务器;--reload = 改代码自动重启):
```bash
uvicorn main:app --port 8000 --reload
```
👀 另开一个终端验证(curl = 命令行里的浏览器):
```bash
curl http://localhost:8000/health
# 你应该看到:{"status":"ok"}
```
🧠 你刚刚学会了后端的全部基本功:**一个函数 = 一个接口;return 字典 = 返回 JSON**。后面所有接口都是这个模式的重复。

### 0.3 建数据库(Supabase,全程点鼠标 + 粘贴 SQL)

🎯 在云上建三张表。**数据库表 ≈ Excel 表**:列名固定,每行一条记录。

⌨️ 步骤:
1. supabase.com 登录 → New project(取名 greencheck,数据库密码记好,区域随意)。
2. 等 2 分钟初始化 → 左侧 **SQL Editor** → New query → 把 wiki `06-Database-Schema` 里的建表 SQL 整段粘贴 → Run。
3. 左侧 **Table Editor** 应能看到三张表:
   - `analysis_jobs`:每次分析一行(单号、公司、状态、分数、证据 JSON…)
   - `analysis_flags`:每条红旗一行(挂在某个 job 上)
   - `cached_companies`:显式缓存索引(公司名 → 上次的 job)
4. 拿钥匙:左侧 Settings → API → 复制 `Project URL` 和 `anon public` key。

⌨️ 回到 `backend/`,建 `.env.example`(钥匙孔清单,**这个**提交 Git)和 `.env`(真钥匙,**不**提交):
```bash
# .env.example 内容:
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ANALYSIS_SERVICE_URL=http://localhost:8001
CACHE_TTL_HOURS=24
```
```bash
cp .env.example .env    # 然后把 .env 里的前两项换成刚复制的真值
echo -e "venv/\n.env\n__pycache__/" >> ../.gitignore   # 确保这些永不提交
```

✅ **M0 过关**:`/health` 返回 ok + Table Editor 三张表截图发群(暗号:"8000 活了,表在")。
📖 参考:`backend/main.py`、wiki `06-Database-Schema`。

---

## Phase 1 — 契约三端点(M1,全项目最关键的一步,约半天)

> 🧠 **为什么这步最关键**:你现在定义的请求/响应形状,就是 A 和你的"合同"。今天定下并喊"冻结",A 从此拿着合同造假数据独立开发,谁也不用等谁。改合同 = 三方都返工,所以照 wiki `05-API-Design` 抄,别发明。

### 1.1 数据库小工具层

⌨️ 新建 `backend/db/supabase.py`:
```python
import os
from supabase import create_client

def get_client():
    # 每次现连(够用了;以后想优化再缓存这个 client)
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

def create_job(job_id: str, company_name: str):
    """新建一行'处理中'的任务。写失败只打印,不抛——数据库挂了也不能影响接口返回。"""
    try:
        get_client().table("analysis_jobs").insert({
            "id": job_id, "company_name": company_name, "status": "processing",
        }).execute()
    except Exception as e:
        print(f"create_job DB write failed (non-critical): {e}")

def get_job(job_id: str):
    """读一行任务;读不到/读炸了都返回 None。"""
    try:
        res = (get_client().table("analysis_jobs").select("*")
               .eq("id", job_id).maybe_single().execute())
        return res.data if res else None
    except Exception as e:
        print(f"get_job failed: {e}")
        return None
```
🧠 注意贯穿全册的纪律:**所有数据库操作都包 try/except,失败打印日志、返回温和的默认值**。这就是"永不 500"的实现方式——基础设施可以炸,接口不能炸。

### 1.2 三个端点

⌨️ 新建 `backend/routes/analyze.py`:
```python
import os, uuid, httpx
from fastapi import APIRouter
from pydantic import BaseModel, model_validator
from db.supabase import create_job, get_job

router = APIRouter()

class AnalyzeRequest(BaseModel):
    # 前端两种写法都收(历史联调血泪:A 发的是 query,B 只认 company_name,白查一晚上)
    company_name: str | None = None
    query:        str | None = None
    claimId:      str | None = None       # 前端会带,收下忽略即可
    manual_content: str | None = None

    @model_validator(mode="after")
    def merge_names(self):
        if not self.company_name and self.query:
            self.company_name = self.query
        return self

@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    name = (req.company_name or "").strip()
    if not name:
        return {"error": "Company name cannot be empty"}    # 统一错误信封,HTTP 仍是 200

    job_id = uuid.uuid4().hex[:8]                            # 8 位随机单号
    create_job(job_id, name)

    # 异步喊 C 开工:发个请求就走,不等它干完(它要 30-60 秒)
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{os.environ.get('ANALYSIS_SERVICE_URL', 'http://localhost:8001')}/run",
                json={"job_id": job_id, "company_name": name,
                      "manual_content": req.manual_content},
                timeout=5,
            )
    except Exception as e:
        print(f"Failed to trigger analysis service: {e}")    # C 没起也不崩,继续返回单号

    return {"job_id": job_id, "id": job_id, "status": "processing",
            "message": f"Analysis started for {name}"}

@router.get("/report/{job_id}")
def get_report(job_id: str):
    job = get_job(job_id)
    if not job:
        return {"error": "Job not found"}    # 约定:不存在也是 200 + 信封,A 的轮询认这个
    return job                                # Phase 2 会换成"规范化后"的 job

@router.get("/history")
def history():
    try:
        res = (get_job.__globals__["get_client"]().table("analysis_jobs")
               .select("id, company_name, status, score, risk_level, created_at")
               .eq("status", "completed").order("created_at", desc=True).limit(20).execute())
        return {"results": res.data or []}
    except Exception as e:
        print(f"history failed: {e}")
        return {"results": []}                # 数据库挂了就给空列表,绝不 500
```
`main.py` 里挂上:`from routes.analyze import router` + `app.include_router(router, prefix="/api")`。

### 1.3 用 curl 全套验收

⌨️
```bash
# ① 正常提交
curl -s -X POST localhost:8000/api/analyze -H 'Content-Type: application/json' \
     -d '{"company_name":"Acme"}'
# 👀 {"job_id":"xxxxxxxx","id":"xxxxxxxx","status":"processing",...}

# ② 空名
curl -s -X POST localhost:8000/api/analyze -H 'Content-Type: application/json' -d '{"company_name":"  "}'
# 👀 {"error":"Company name cannot be empty"}

# ③ 轮询一个不存在的单号
curl -s localhost:8000/api/report/nope
# 👀 {"error":"Job not found"}

# ④ 手工在 Supabase Table Editor 里把刚才那行的 status 改成 completed、score 填 61,再:
curl -s localhost:8000/api/report/你的job_id
# 👀 能看到 completed + 61(这就是 A 将来轮到的东西)
```

✅ **M1 过关**:四条 curl 全对。在群里喊:**"双态可用,字段按 wiki 05,契约冻结!"** —— A 从此独立。commit + merge。
📖 参考:`backend/routes/analyze.py`、`backend/db/supabase.py`。

---

## Phase 2 — 规范化器:你的核心资产(约半天)

🎯 C 写进库的数据、老数据、缓存数据,形状各有差异(命名风格、证据可能是字符串数组…)。写一个 `_normalise_job`,**进什么形状,出都是合同形状**。

### 2.1 证据对象化:唯一转换点(完整抄写)

🧠 历史上证据存过"字符串数组"(就是几个 URL),后来升级成对象数组(带标题/出处/权重…)。**团队硬规则①:前端永远只见对象** —— 转换在你这做,而且只在一个函数里做(曾经有两份转换逻辑各自演化,PDF 那条路漏了,断库时 PDF 里全是裸网址)。

⌨️ 加到 `db/supabase.py`:
```python
def coerce_evidence_objects(evidence) -> list[dict]:
    """证据规范化的【唯一】入口:
    - 不是 list → 空列表
    - 元素是 dict → 原样放行(千万别挑字段重组!C 算的 reliability/recency/relevance
      三个分量字段必须原样到前端,这是 M5 三条权重 bar 的数据源)
    - 元素是 str(老格式)→ 包成最小对象
    """
    if not isinstance(evidence, list):
        return []
    out = []
    for i, item in enumerate(evidence):
        if isinstance(item, dict):
            out.append(item)
        elif isinstance(item, str):
            is_url = item.startswith("http")
            out.append({
                "id": f"E-{i+1:02d}", "kind": "News", "title": item,
                "org": "", "date": "", "url": item if is_url else "",
                "quote": "", "weight": 0.5,
            })
    return out
```

### 2.2 `_normalise_job`(行为清单,照单实现)

⌨️ 在 `routes/analyze.py` 写 `_normalise_job(job) -> dict`,逐条行为:
1. `evidence = coerce_evidence_objects(job.get("sources") or [])`(库里 JSONB 字段叫 sources,内容是证据对象数组)。
2. **双命名**:同时给 `risk_level` 和 `riskLevel`、`dimension_scores` 和 `dimensionScores`(五个维度键齐全,缺的补 0)——前端两种风格都有人写过,你两个都给,谁也不会崩。
3. flags 每条保证 severity(缺失按类型推断:Data Contradiction、Negative News→high;Vague Claims、Lack of Certification→medium;其余 low)。
4. **`fail_reason` 无条件透传**(硬规则②):`scraping_snippet_fallback` 会出现在 **completed** 的任务上,意思是"报告基于搜索摘要"——你抹掉它,A 的诚实横幅就瞎了。
5. 顺手给个 `sources`:证据对象里 url 的列表(老字段,留着兼容)。

然后把 `/report` 的返回换成 `_normalise_job(job)`。

👀 自测:把 Table Editor 里那行的 `sources` 列手工填 `["https://a.example", "Some Registry"]`(故意用老格式),curl `/api/report/...`,应看到两个**对象**而不是两个字符串。

✅ 过关:上述 curl 形状正确。commit + merge。
📖 参考:`routes/analyze.py` 的 `_normalise_job`。

---

## Phase 3 — 三层缓存 + 永不白屏(M3,约一天)

🎯 同一家公司不重复花钱花时间分析;**就算数据库整个挂掉,五家预载公司也要照常出报告**。

### 3.1 三层瀑布

⌨️ `db/supabase.py` 加:
```python
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

CACHE_TTL_HOURS = int(os.environ.get("CACHE_TTL_HOURS", "24"))

# ⚠️ 必须有 .resolve()!历史大坑:__file__ 经过含 ".." 的导入路径时,
# .parent 是"纯文字"运算不会化简 "..",路径会被剥坏——本地直跑碰巧正常,
# pytest 里缓存全失效,还被一条过宽的旧断言掩盖了很久。
_CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "analysis" / "local_cache.json"

def _load_local_cache() -> dict:
    try:
        return json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"local cache load failed: {e}")
        return {}

_LOCAL_CACHE = _load_local_cache()

def _cache_lookup(company_name: str):
    """大小写不敏感 + 部分匹配:'Shell plc' 也能命中 'shell'。"""
    key = company_name.strip().lower()
    if key in _LOCAL_CACHE:
        return key, _LOCAL_CACHE[key]
    for k in _LOCAL_CACHE:
        if k in key or key in k:
            return k, _LOCAL_CACHE[k]
    return None, None

def get_cached_company(company_name: str):
    """三层瀑布,每层独立 try/except,任何一层炸都静默落到下一层:
       L1 cached_companies 表(显式缓存)
       L2 analysis_jobs 里 TTL 内最近一次 completed
       L3 analysis/local_cache.json(五家演示公司,离线保命)"""
    # L1
    try:
        res = (get_client().table("cached_companies").select("*")
               .ilike("company_name", company_name.strip()).maybe_single().execute())
        if res and res.data:
            job = get_job(res.data["job_id"])
            if job: return job
    except Exception as e:
        print(f"cached_companies lookup failed: {e}")
    # L2
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=CACHE_TTL_HOURS)).isoformat()
        res = (get_client().table("analysis_jobs").select("*")
               .ilike("company_name", company_name.strip())
               .eq("status", "completed").gte("completed_at", cutoff)
               .order("completed_at", desc=True).limit(1).execute())
        if res.data: return res.data[0]
    except Exception as e:
        print(f"analysis_jobs cache lookup failed: {e}")
    # L3
    key, cached = _cache_lookup(company_name)
    if cached:
        print(f"Cache hit (local_cache.json): {company_name}")
        return _cache_to_job(company_name, cached)
    return None

def _cache_to_job(company_name: str, cached: dict) -> dict:
    """把本地缓存条目伪装成一行 job。⚠️ 这里必须过 coerce_evidence_objects——
    /report 和 /pdf 直接消费这个返回值,漏了这步,断库时 PDF 里就是裸字符串(真实 P0 事故)。"""
    dim = cached.get("dimension_scores") or cached.get("dimensionScores") or {}
    evidence = coerce_evidence_objects(cached.get("evidence") or cached.get("sources") or [])
    flags = []
    for f in cached.get("flags", []):
        t = f.get("type", "")
        flags.append({**f, "severity": f.get("severity") or (
            "high" if t in ("Data Contradiction", "Negative News") else
            "medium" if t in ("Vague Claims", "Lack of Certification") else "low")})
    return {
        "id": f"local:{company_name}", "company_name": company_name,
        "status": "completed", "step": None, "fail_reason": None,
        "score": cached.get("score"), "risk_level": cached.get("risk_level"),
        "summary": cached.get("summary"), "sources": evidence,
        "dimension_scores": dim, "completed_at": None, "analysis_flags": flags,
    }
```
接线:`/analyze` 开头先 `job = get_cached_company(name)`,命中就直接 `return _normalise_job(job)`(用户秒拿报告);`/report/local:XXX` 这种单号,剥掉前缀走 `_cache_lookup` 这条纯本地路。

### 3.2 relay 回退:数据库挂了,报告也要到家

🧠 想一个场景:数据库挂了 → C 算完了**写不进去** → 你 `get_job` 读不到 → 用户轮询到超时。结果明明算出来了!所以 C 会把每个结果在自己内存里留一份,并开一个 `GET /result/{job_id}`;**你读库失败时,去问 C 一嘴**:

⌨️ `routes/analyze.py` 加:
```python
def _relay_lookup(job_id: str):
    """NFR-09:库里没有时,回查 C 的内存副本。问不到/状态 unknown 都当没有。"""
    url = os.environ.get("ANALYSIS_SERVICE_URL", "http://localhost:8001")
    try:
        res = httpx.get(f"{url}/result/{job_id}", timeout=3)
        res.raise_for_status()
        record = res.json()
    except Exception as e:
        print(f"relay lookup failed for {job_id}: {e}")
        return None
    if not isinstance(record, dict) or record.get("status") in (None, "unknown"):
        return None
    print(f"relay hit for {job_id} (served from analysis-service memory, NFR-09)")
    return record
```
`/report` 改成:`job = get_job(job_id) or _relay_lookup(job_id)`(`local:` 前缀的除外)。

👀 自测"断库演习":把 `.env` 的 `SUPABASE_URL` 临时改成 `https://placeholder.supabase.co`,重启服务:
```bash
curl -s -X POST localhost:8000/api/analyze -H 'Content-Type: application/json' -d '{"company_name":"Shell"}'
# 👀 立刻返回 completed + score 78 + 5 条带分量的证据(L3 本地缓存救场)
```
〔联调〕等 C 的 M3 也好了,做全队演习:断库 + 让 C 用 USE_MOCK 跑一个新公司 → 你这边轮询应经 relay 拿到 completed。演完把 `.env` 改回去。

✅ **M3 过关**:断库 Shell 满血;relay 命中日志见过一次。commit + merge。
📖 参考:`db/supabase.py` 全文、`routes/analyze.py` 的 `_relay_lookup`。

---

## Phase 4 — PDF 生成(M4,约半天)

🎯 `GET /api/report/{job_id}/pdf` 吐一份排版好的 PDF。思路:**拼一段 HTML,让 WeasyPrint 把它渲染成 PDF**——你已经会写网页了,所以你已经会生成 PDF 了。

⌨️ 新建 `backend/pdf/generator.py`,骨架:
```python
import html as _html
import tempfile
from weasyprint import HTML

def _esc(value) -> str:
    """⚠️ 安全要求,不是洁癖:公司名/摘要/旗子/引文都来自 AI 输出和抓取文本,
    出现 < > & 是常态,不转义会把 PDF 排版打烂(甚至被恶意构造)。
    规矩:凡是"不是你自己写死的字符串",插进 HTML 前一律过 _esc()。"""
    return _html.escape(str(value if value is not None else ""), quote=True)

def generate_pdf(job: dict) -> str:
    company = _esc(job.get("company_name", "Unknown Company"))
    score   = job.get("score", 0) or 0
    rows = ""
    for ev in (job.get("sources") or [])[:5]:
        if isinstance(ev, dict):
            rows += f"<tr><td>{_esc(ev.get('id'))}</td><td>{_esc(ev.get('kind'))}</td>" \
                    f"<td>{_esc(ev.get('title'))}<br><i>\"{_esc(ev.get('quote'))}\"</i></td>" \
                    f"<td>{ev.get('weight', '')}</td></tr>"
        else:   # 防御:万一漏网一条老格式字符串,也别让 PDF 崩
            rows += f"<tr><td colspan='4'>{_esc(ev)}</td></tr>"
    doc = f"""
    <html><body>
      <h1>{company} — Greenwashing Risk Report</h1>
      <h2>Score: {score} · {_esc(job.get('risk_level', '—'))}</h2>
      <p>{_esc(job.get('summary', '—'))}</p>
      <table border="1" cellspacing="0">{rows}</table>
      <footer>GreenCheck · Greenwashing Detection Engine · AI engine: Gemini / Groq</footer>
    </body></html>"""
    path = tempfile.mktemp(suffix=".pdf")
    HTML(string=doc).write_pdf(path)
    return path
```
路由(`routes/analyze.py`):
```python
from fastapi.responses import FileResponse
from pdf.generator import generate_pdf

@router.get("/report/{job_id}/pdf")
def download_pdf(job_id: str):
    if job_id.startswith("local:"):
        _, cached = _cache_lookup_by_prefix(job_id)   # 自己包一层:剥前缀→_cache_lookup→_cache_to_job
        job = cached
    else:
        job = get_job(job_id) or _relay_lookup(job_id)
    if not job or job.get("status") != "completed":
        return {"error": "Report not ready"}
    path = generate_pdf(job)
    return FileResponse(path, media_type="application/pdf",
                        filename=f"{job.get('company_name','report')}_greenwashing_report.pdf")
```

👀 验收:
```bash
curl -s -o shell.pdf "localhost:8000/api/report/local:Shell/pdf" && head -c 5 shell.pdf
# 👀 %PDF-   (这五个字符就是 PDF 文件的开头标识)
```
双击打开 shell.pdf 肉眼看排版。之后照参考实现把分数弧、五维条、旗子卡补成完整五段(那是纯 HTML/CSS 功夫,放心抄)。

✅ M4 过关:两条路(真实 job 和 local:)都能出能打开的 PDF。把 PDF 发群里互相挑刺。
📖 参考:`backend/pdf/generator.py`(完整五段排版 + 12 个转义点)。

---

## Phase 5 — M5 透传核验(半小时,但要正式做)

🎯 你没有新代码。你的任务是**证明** C 算的三分量穿过你毫发无损:
```bash
curl -s -X POST localhost:8000/api/analyze -H 'Content-Type: application/json' \
  -d '{"company_name":"Shell"}' | python3 -m json.tool | grep -A3 reliability | head -8
# 👀 首条证据里有 "reliability": 0.9, "recency": 0.95, "relevance": 0.85
```
〔联调〕对 A 喊:"Shell E-01 三分量 0.90/0.95/0.85,接好了喊我。" A 的三条 bar 亮起真值 = M5 合龙。

⚠️ 如果 A 说"三条 bar 全是 est."——99% 是你某处"重组了证据对象、漏带三分量字段"。回 Phase 2.1 的注释。

---

## Phase 6 — 测试:把承诺钉死(M6,约半天)

🧠 **pytest 入门 60 秒**:测试就是普通函数,名字以 `test_` 开头,里面用 `assert 条件` 断言;`pytest` 命令会自动找到并运行它们,绿点=过,F=挂。挂了它会指出哪一行的断言、期望什么、实际什么——**这是最好的报错信息**。

⌨️ 新建 `backend/tests/test_normalise.py`,起手三条(剩下照这个味道补到约 12 条):
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))   # 让测试能 import 上层代码

from db.supabase import coerce_evidence_objects, _cache_to_job

def test_strings_become_objects():
    out = coerce_evidence_objects(["https://a.example", "Some Registry"])
    assert all(isinstance(e, dict) for e in out)
    assert out[0]["url"] == "https://a.example"

def test_dict_passthrough_keeps_components():
    ev = {"id": "E-01", "kind": "News", "weight": 0.8,
          "reliability": 0.85, "recency": 0.95, "relevance": 0.8}
    out = coerce_evidence_objects([ev])
    assert out[0]["reliability"] == 0.85      # 三分量必须原样存活(M5 的命根)

def test_cache_to_job_coerces_legacy_strings():
    legacy = {"score": 70, "risk_level": "High Risk", "summary": "s",
              "dimension_scores": {}, "flags": [],
              "sources": ["https://old.example"]}
    job = _cache_to_job("OldCo", legacy)
    assert isinstance(job["sources"][0], dict)   # P0 事故的回归测试
```
再建 `backend/tests/test_integration_local_cache.py`:用 FastAPI 自带的 TestClient(假浏览器)+ 占位数据库地址,把"断库演习"变成自动化:
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")   # 故意指向不存在的库
os.environ.setdefault("SUPABASE_ANON_KEY", "placeholder")
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

def test_shell_full_report_when_db_down():
    data = client.post("/api/analyze", json={"company_name": "Shell"}).json()
    assert data["status"] == "completed"
    assert data["evidence"], "断库时缓存证据必须在"
    # ⚠️ 别写宽松断言("有 score 或 job_id 就行")——历史上正是这种断言掩盖了路径 bug
```
⌨️ 跑:
```bash
SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder \
ANALYSIS_SERVICE_URL=http://x pytest tests/ -q
```
👀 全绿。照参考实现把套件补齐到 33 条(每条都是本册某个"⚠️"的化身)。

✅ **M6 过关**:33 passed 截图发群。
📖 参考:`backend/tests/` 三个文件(relay 的测试用了 importlib 加载 C 的服务,写法见 `test_integration_local_cache.py` 的 fixture——直接 `import main` 会撞你自己的 main,这是真踩过的坑)。

---

## 症状速查

| 症状 | 多半是 | 去哪修 |
|------|--------|--------|
| `ModuleNotFoundError` | 没进虚拟环境 | `source venv/bin/activate` |
| 改了 `.env` 不生效 | 服务没重启 | Ctrl+C 重跑 uvicorn |
| pytest 里缓存全 miss,手动跑正常 | 路径词法剥离 | Phase 3.1 的 `.resolve()` |
| 断库时 PDF 全是裸网址 | `_cache_to_job` 没过对象化 | Phase 3.1 注释处 |
| A 说三条 bar 全 est. | 透传时重组对象丢了分量 | Phase 2.1 |
| A 说降级横幅不显示 | fail_reason 没透传 | Phase 2.2 第 4 条 |
| weasyprint ImportError | 缺系统库 | Phase 0.1 的 ⚠️ |
| CI 装完依赖、跑到 PDF 测试就崩(`'super' object has no attribute 'transform'`) | weasyprint 62.x 没限制搭档库 pydyf 的版本上限,全新环境装到太新的 pydyf 就不兼容;反过来钉 pydyf==0.8 又低于它要求的最低版,pip 直接报冲突 | 把 weasyprint 升级到 69.0(根目录和 backend 两份 requirements 一起改),让它自己管 pydyf |

## 写给你的最后一段话

后端最反直觉的一课:**你的价值不在"聪明",在"无聊的可靠"**。每个 try/except、每次形状归一、每层缓存兜底,单看都平平无奇;叠在一起,就是"拔掉数据库、产品照样体面"的底气。把这份无聊坚持到 M6,你会在测试全绿的那一刻明白它值多少。
