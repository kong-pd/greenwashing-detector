# 重建手册 B v2 — 后端与数据库(Railway web-service + Supabase 部署单元)

> **你是谁**:后端工程师(人类或编码代理均可)。你独立负责 FastAPI web-service:HTTP 契约的唯一实现者、三层缓存、响应规范化、PDF 生成、NFR-09 relay 的**读侧**;以及 Supabase 两张表。
> **你交付什么**:`backend/` 目录 + Supabase schema —— 33 个 pytest(含断库集成与 PDF 冒烟)全绿;断库时五家预载公司照常出完整报告与 PDF。
> **你不碰什么**:抓取、enricher、AI 调用、权重计算(全是 C 的);前端组件。你消费 C 写进 DB/relay 的结果,生产前端要的形状。
>
> **导师提示**:web-service 的本质是**形状守门员** —— 不管上游(Supabase / 本地缓存 / relay)给你什么历史形状,出你这道门的 JSON 永远是同一个契约。把这句话贴在屏幕上。

---

## 0. 开工前(全员同步段,与 A/C 相同)

### 0.1 跨团队六条硬规则
同手册 A §0.1 / wiki `11-Rebuild-Playbook`。对你最致命的是 **1**(对象化是你的职责)、**2**(completed+fail_reason 共存要透传)、**6**(永不有意 5xx)。

### 0.2 必读契约
| 文档 | 必读节 | 拿走什么 |
|------|--------|----------|
| wiki `05-API-Design` | 全文 | 你就是它的实现;尤其 Field conventions、fail_reason 四值表、Unknown job 信封、Resilience(NFR-09)段 |
| wiki `06-Database-Schema` | 建表 SQL、字段说明、Environment Variables | 两张表照建;env 全集 |
| wiki `10-Evidence-Pipeline` | Evidence Object Schema、Stage 4 | 你透传的对象长什么样(11 字段含三分量) |
| wiki `03-NFR` | NFR-09 全节 | 三层缓存顺序、TTL、写失败兜底语义 |

### 0.3 环境

```bash
python3 -m venv venv && source venv/bin/activate
pip install fastapi uvicorn python-dotenv httpx supabase weasyprint pytest pytest-asyncio
# WeasyPrint 系统库(Ubuntu):libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0
cp .env.example .env   # 填 SUPABASE_URL / SUPABASE_ANON_KEY / ANALYSIS_SERVICE_URL,其余可占位
uvicorn main:app --port 8000 --reload
```

---

## 里程碑总览

| 里程碑 | 你交付 | 验收口令 |
|--------|--------|----------|
| **M0** | `/health` 200;两张表建好 | "8000 活了,表在" |
| **M1** | `/api/analyze` 双态 + `/api/report/{id}` 轮询面;**契约冻结** | "A 可以对着我写轮询了" |
| **M2** | 触发 C 的 `/run`;fail_reason 透传(含 completed+snippet 共存) | "C 写什么我吐什么,形状不走样" |
| **M3** | 三层缓存 + TTL + `local:` 通道 + **relay 读侧** + 永不 5xx | "拔掉 Supabase,Shell 照样满血" |
| **M4** | PDF 生成(转义 + 混合证据兼容 + 正式页脚) | "PDF 拿得出手" |
| **M5** | 分量透传核验(三字段原样到前端) | "A 的三条 bar 读到真值" |
| **M6** | pytest 33 绿;CI 配 WeasyPrint 系统库 | "CI 全绿" |

> **并行性**:M0–M1 你不依赖任何人;M1 一到立刻喊 A(它从假数据切到你)。M2 起你需要 C 的 `/run` 存在,但**联调前你可以 mock httpx 推进**;M3 的 relay 读侧只依赖 C 的 `/result/{id}` 端点契约(一句话即可对齐,不必等实现)。

---

## Phase 0 — Supabase 与骨架(M0)

1. Supabase 新项目,SQL Editor 执行 wiki 06 的建表 SQL:
   - `analysis_jobs(id text pk, company_name, status, step, fail_reason, score int, risk_level, summary, sources jsonb, dimension_scores jsonb, created_at, completed_at)`
   - `analysis_flags(id serial pk, job_id fk, type, severity, description, source)`
   - `cached_companies(company_name pk, job_id, cached_at)`
2. **fail_reason 列注释照 wiki 06 写全四值**(三个失败 + `scraping_snippet_fallback` 这个"可出现在 completed 上的注记")—— 后来者会感谢这行注释。
3. `main.py`:FastAPI + CORS(开发期 `*`,文件里留 TODO 收紧)+ `include_router(prefix="/api")` + `/health`。

**自测**:`curl localhost:8000/health` → `{"status":"ok"}`。

---

## Phase 1 — 契约面(M1,全项目最关键的一步,趁早冻结)

**目标**:把 wiki 05 变成可调用的现实,然后**冻结**。A 的全部进度从这一刻起与你解耦。

1. 请求模型(注意前端字段别名,这是历史联调血泪):
   ```python
   class AnalyzeRequest(BaseModel):
       company_name: str | None = None
       query:        str | None = None      # 前端可能用这个名
       claimId:      str | None = None      # 收下并忽略
       manual_content: str | None = None
       # model_validator: company_name 缺省时取 query
   ```
2. `POST /api/analyze` 三分支:空名 → `{"error": "Company name cannot be empty"}`;缓存命中 → 直接吐完整规范化报告(Phase 3 实装,此刻可先 miss);miss → 生成 8 位 job_id、`create_job`(写库失败只打日志,**不抛**)、异步触发 C、返回 `{job_id, id, status:"processing", message}`。
3. `GET /api/report/{job_id}` 轮询面 + `GET /api/report/{job_id}/pdf` 占位 + `GET /api/history`(读库失败返回 `{"results": []}`,绝不 5xx)。

〔联调 · M1 暗号〕对 A 喊:"双态可用,字段按 wiki 05,冻结。" 此后任何契约改动 = 三方会签 + 改 wiki 在前。

**DoD**:✦ 三端点 200 ✦ 空名信封 ✦ 假 completed(手填一行库数据)能被 A 渲染。

---

## Phase 2 — 规范化器:你的核心资产(M1→M5 贯穿)

**目标**:`_normalise_job(job) -> dict`,上游任何形状进,契约形状出。

**为什么单独成 Phase**:它是历史上 bug 最密的地方,也是 M5 能否成立的咽喉。逐条行为(每条都有对应测试名,照着写就是 TDD):

1. **对象化单一来源**(硬规则 1):在 `db/supabase.py` 实现并 export
   ```python
   def coerce_evidence_objects(evidence) -> list[dict]:
       # 非 list → [];dict 原样透传(保住 reliability/recency/relevance!);
       # str → 最小对象 {id:"E-%02d", kind:"News", title:s, org:"", date:"",
       #                url: s if s.startswith("http") else "", quote:"", weight:0.5}
   ```
   路由层 import 它,**不要**在路由里再写一份(历史教训:两份实现各自演化,PDF 路径漏掉了)。
2. 双命名:`risk_level`/`riskLevel`、`dimension_scores`/`dimensionScores`(五键齐,缺的补 0)。
3. flags:每条保证 severity(缺失按类型推断,映射同手册 A Phase 2)。
4. **fail_reason 永远透传**,不管 status 是什么(硬规则 2 的实现位)。
5. 派生 `sources`:evidence 对象里的 url 列表(legacy 便利字段)。
6. `evidence` 键 = 对象化后的 `job["sources"]`(库里 JSONB 存的就是对象数组;legacy 行才会是字符串数组)。

**自测**(这些测试此 Phase 末必须存在并绿):
```bash
pytest tests/test_normalise.py -q
# 覆盖:字符串→对象/混合/垃圾输入;dict 透传分量原样;
#       completed+scraping_snippet_fallback 共存;severity 推断;双命名一致
```

---

## Phase 3 — 三层缓存 + relay 读侧(M3,断库底气)

**目标**:`get_cached_company` 三层瀑布;`local:` 合成通道;DB 读不到时回查 C 的内存 relay。

1. **三层顺序与理由**:
   - L1 `cached_companies`(显式永久缓存)→ L2 `analysis_jobs` 完成且在 `CACHE_TTL_HOURS`(默认 24,env 可调)内的最近一条 → L3 `analysis/local_cache.json`(五家夹具,无 TTL)。
   - 每层独立 try/except,**任何一层炸都只打日志落到下一层**。
2. **路径解析的历史教训(必抄)**:
   ```python
   _CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "analysis" / "local_cache.json"
   ```
   没有 `.resolve()` 时,`__file__` 若经含 `..` 的 sys.path 进来,`parent` 链是**纯词法**剥离,路径会被剥坏 —— 生产碰巧正常、pytest 全军覆没,且曾被宽松断言掩盖。测试断言一律写"completed + evidence 非空",不写"score 或 job_id 有一个就行"。
3. `_cache_lookup`:大小写不敏感 + 双向包含部分匹配("Shell plc" 命中 "shell")。
4. `_cache_to_job`:把夹具塑形成 job 记录,`sources` 字段 = `coerce_evidence_objects(cached.evidence or cached.sources)` —— **这里就是历史 P0 缺口**:/pdf 直接消费这个原始 job,不过对象化这关,PDF 会渲染裸字符串。
5. `local:` 通道:`/analyze` 命中 L3 返回的 job_id 形如 `local:Shell`;`/report/local:X` 与 `/pdf` 剥前缀走 `get_job_with_local_fallback`。
6. **relay 读侧(NFR-09)**:`get_job(job_id)` 为 None 且非 `local:` 时:
   ```python
   httpx.get(f"{ANALYSIS_SERVICE_URL}/result/{job_id}", timeout=3)
   # status in (None, "unknown") → 当作没有;否则该 record 已是 job 形状,直接 _normalise_job
   ```
   `/report` 与 `/pdf` 都接(写一个 `_resolve_job` 共用)。语义:**Supabase 全程没写进去,用户也拿得到报告**。
7. 未知 job:`{"error": "Job not found"}`(HTTP 200,硬规则 6;wiki 05 已把 404 旧约废止)。

**自测**:
```bash
SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder \
pytest tests/test_integration_local_cache.py -q
# 断库下:五家公司 completed 全字段;Shell plc 部分匹配;local: 往返;
# relay 双态(completed/processing)经 monkeypatch httpx 验证
```
**DoD**:✦ 拔库五家满血 ✦ relay 命中日志可见 ✦ 全程无 5xx。

---

## Phase 4 — PDF 生成(M4)

**目标**:WeasyPrint 五段式报告,与网页 §1–§5 同构。

1. 结构:分数弧(SVG path 三角函数画)→ 五维 bar+badge → 前 3 条 flag 卡 → 前 5 条证据(权重 bar)→ 方法论表。
2. **转义是安全要求不是洁癖**:公司名/summary/flag 各字段/证据 title/org/date/quote/job_id —— 全部过 `html.escape`(12 个插值点)。AI 输出和抓取文本里出现 `<` 是常态。
3. 证据行写**双形状兼容**:dict 走完整行,str 走单格行 —— 虽然 Phase 3 的对象化后正常路径只会有 dict,但 PDF 是最后一道门,防御性保留。
4. 页脚(正式品牌,无赛事标识):`GreenCheck · Greenwashing Detection Engine` + `AI engine: Gemini / Groq · Standards: TCFD · GRI 305 · GRI 2-27 · EU Taxonomy · EU GCD 2024` + 免责声明 + Report ID。
5. 路由:仅 `status == "completed"` 出文件,否则 `{"error": "Report not ready"}`(200)。

**自测**:`pytest tests/ -k pdf -q`(注入 payload + 混合证据冒烟,产物 `%PDF-` 且 >10KB);本地 `curl -o x.pdf localhost:8000/api/report/local:Shell/pdf` 肉眼验版。

---

## Phase 5 — M5 透传核验(半小时,但要正式做)

你在 M5 没有新代码 —— 你的职责是**证明三分量穿过你毫发无损**:
```bash
pytest tests/test_normalise.py::test_normalise_job_dual_casing_and_components -q
curl -s localhost:8000/api/analyze -X POST -H 'Content-Type: application/json' \
  -d '{"company_name":"Shell"}' | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['evidence'][0])"
# 期望首条含 reliability/recency/relevance 三键
```
〔联调 · M5 暗号〕对 A:"Shell 首条 0.90/0.95/0.85,接好了喊我。"

---

## Phase 6 — 测试与 CI(M6)

最小测试集(33 条的骨架):
- `test_api.py`:health / analyze 双字段 / 空名 / **Patagonia 严格断言** / history 兜底。
- `test_normalise.py`:Phase 2 的 12 条。
- `test_integration_local_cache.py`:Phase 3 的断库矩阵 + relay fixture(用 `importlib.util.spec_from_file_location` 以独立名加载 C 的 main —— 直接 `import main` 会撞你自己的 main 模块缓存,这是写测试时真踩过的坑)+ PDF 冒烟。

CI(backend job):装 `libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0` 后再 `pip install`;env 给全占位(含 SUPABASE 两项)。

**最终验收(agent 可自动执行)**:
```bash
cd backend && SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder \
ANALYSIS_SERVICE_URL=http://x USE_MOCK=true pytest tests/ -q     # 33 passed
```

---

## 坑与回退

| 症状 | 原因 | 处理 |
|------|------|------|
| pytest 下缓存全 miss,直跑正常 | `__file__` 路径词法剥离 | `.resolve()`(Phase 3.2);严断言防再掩盖 |
| 断库 PDF 出裸字符串行 | `_cache_to_job` 没过对象化 | 单一转换点 `coerce_evidence_objects` |
| A 报"三条 bar 全 est." | 透传层重建对象丢了分量字段 | dict 必须**原样透传**,别"挑字段重组" |
| snippet 报告被前端当失败 | completed 时把 fail_reason 抹掉/没透传 | 硬规则 2:无条件透传 |
| 写库失败后轮询永远 processing 直至超时 | 只读库不读 relay | Phase 3.6;relay 是 NFR-09 的另一半 |
| CI 上 weasyprint ImportError | 缺系统库 | CI 先 apt 后 pip |
| 测试里 `import main` 拿错服务 | 同名模块缓存 | importlib 独立命名加载 |

## 给后来者的一句话

你的服务没有"聪明逻辑",只有**纪律**:形状不走样、失败不上抛、缓存层层兜、注记原样传。无聊,但全项目的"永不白屏"靠的就是这份无聊。
