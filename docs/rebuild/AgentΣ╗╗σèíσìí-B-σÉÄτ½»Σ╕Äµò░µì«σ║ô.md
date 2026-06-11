# Agent 任务卡 · B 轨(后端与数据库)

> 操作员使用说明同 A 轨卡首。注意:**Supabase 建项目/拿密钥是人工步骤**(涉及账号与密钥,宪法红线),卡内已把"人做的"与"agent 做的"分开标注。

---

## 卡 B-M0 · 骨架 + 数据库

```
【角色与边界】你是 GreenCheck 的 backend agent,只允许创建/修改 backend/ 下的文件(及按卡说明追加根 .gitignore 条目)。先读仓库根 AGENTS.md。
【人工前置(操作员完成后告知你"已就绪")】Supabase 建项目→SQL Editor 执行 wiki 06 建表 SQL→三张表可见→将 URL/anon key 填入 backend/.env(不给你看真值)。
【先读】wiki 06-Database-Schema 全文;v2-B 册 Phase 0。
【交付】
 1) backend/ venv + 依赖(fastapi uvicorn[standard] python-dotenv httpx supabase weasyprint pytest pytest-asyncio)→ pip freeze > requirements.txt;
 2) main.py:load_dotenv、CORS 全放行+TODO 注释、/health;
 3) .env.example(SUPABASE_URL/SUPABASE_ANON_KEY/ANALYSIS_SERVICE_URL/CACHE_TTL_HOURS=24);确保根 .gitignore 含 venv/、.env、__pycache__/。
【完成判据】
 a) uvicorn main:app --port 8000 启动后 curl -s localhost:8000/health → {"status":"ok"};
 b) git status 确认 .env 未被跟踪(贴输出);
 c) cat .env.example(贴全文,确认无真实密钥)。
【人工检查点】Table Editor 截图三张表;确认 anon key 从未出现在任何 agent 输出里。
```

## 卡 B-M1 · 契约三端点(完成后即冻结)

```
【角色与边界】同上。
【先读】wiki 05-API-Design 全文(你就是它的实现);v2-B 册 Phase 1;AGENTS.md 硬规则 6 与红线"不得改契约"。
【交付】
 1) db/supabase.py:get_client/create_job/get_job(全部 try/except,失败打日志返回温和默认,绝不抛到路由);
 2) routes/analyze.py:
    - AnalyzeRequest:company_name 与 query 双字段兼容(validator 合并),收下并忽略 claimId,manual_content 可选;
    - POST /analyze:空名→{"error":"Company name cannot be empty"}(HTTP 200);8 位 hex job_id;create_job;httpx 异步触发 {ANALYSIS_SERVICE_URL}/run(timeout 5,失败仅日志);返回 {job_id,id,status:"processing",message};
    - GET /report/{job_id}:查无→{"error":"Job not found"}(HTTP 200);
    - GET /history:completed 倒序 limit 20,异常→{"results":[]};
 3) main.py include_router(prefix="/api")。
【完成判据(逐条贴真实输出)】
 a) curl -s -X POST localhost:8000/api/analyze -H 'Content-Type: application/json' -d '{"company_name":"Acme"}' → 含 job_id 与 "processing";
 b) 同上但 -d '{"query":"Acme"}' → 同样成功(双字段兼容);
 c) -d '{"company_name":"  "}' → {"error":"Company name cannot be empty"};
 d) curl -s localhost:8000/api/report/nope → {"error":"Job not found"};
 e) 临时把 .env 的 SUPABASE_URL 改为 https://placeholder.supabase.co 重启:重复 a) 与 d) 仍为 200 JSON(贴输出后改回)——"永不 5xx"实证。
【人工检查点】对照 wiki 05 字段名逐个核对;在群里喊"契约冻结";merge。
```

## 卡 B-M2 · 规范化器(对象化唯一转换点 + 透传)

```
【角色与边界】同上。
【先读】wiki 05 的 Field conventions 表与 fail_reason 四值表;wiki 10 的 Evidence Object Schema;v2-B 册 Phase 2;AGENTS.md 硬规则 1/2。
【交付】
 1) db/supabase.py 导出 coerce_evidence_objects(evidence):非 list→[];dict 原样透传(注释写明:reliability/recency/relevance 分量必须存活);str→最小对象 {id:"E-%02d",kind:"News",title,org:"",date:"",url(仅 http 开头),quote:"",weight:0.5};
 2) routes/analyze.py 的 _normalise_job(job):evidence=coerce(job["sources"]);双命名 risk_level/riskLevel 与 dimension_scores/dimensionScores(五键齐、缺补 0);flags 补 severity(同 A 轨映射);fail_reason 无条件透传;派生 sources=evidence 内 url 列表;/report 返回改为 _normalise_job(job)。
【完成判据】
 a) Table Editor 手填一行:sources=["https://a.example","Some Registry"],status=completed → curl /api/report/<id>,贴 JSON:evidence 两个对象、首条 url=https://a.example;
 b) 再手填一行:sources=[完整对象含三分量],fail_reason="scraping_snippet_fallback",status=completed → curl 贴 JSON:status 与 fail_reason 并存、三分量原样;
 c) grep -rn "isinstance(item, str)" routes/ db/ → 仅 db/supabase.py 一处(唯一转换点)。
【人工检查点】操作员复述硬规则 1/2 各对应哪段代码。
```

## 卡 B-M3 · 三层缓存 + local: 通道 + relay 读侧

```
【角色与边界】同上。
【先读】wiki 03 NFR-09 全节(含 Write Failure Handling 的 relay 实现注记);v2-B 册 Phase 3。
【交付】
 1) db/supabase.py:_CACHE_PATH = Path(__file__).resolve().parent.parent.parent/"analysis"/"local_cache.json"(注释写明 .resolve() 防词法剥离的历史 bug);_load_local_cache/_cache_lookup(大小写不敏感+双向部分匹配)/get_cached_company 三层瀑布(cached_companies→TTL 内最近 completed→本地夹具,每层独立 try/except)/_cache_to_job(必须过 coerce;flags 补 severity;id="local:<name>");
 2) routes:/analyze 命中缓存直接返回 _normalise_job;/report 与 /pdf 支持 local: 前缀;
 3) _relay_lookup(job_id):httpx GET {ANALYSIS_SERVICE_URL}/result/{job_id} timeout 3;status 缺失或 "unknown" 视为无;/report 与 /pdf 的 get_job 失败路径接 or _relay_lookup(job_id)(local: 除外)。
【完成判据(全部在 SUPABASE_URL=placeholder 断库 env 下)】
 a) curl POST /api/analyze {"company_name":"Shell"} → status completed、score 78、evidence 5 条且首条含三分量(贴 JSON 摘录);
 b) {"company_name":"Shell plc"} → 同样命中(部分匹配);
 c) curl /api/report/local:Shell → completed(贴 status 行);
 d) 终端日志含 "Cache hit (local_cache.json)"(贴该行);
 e) python3 -c "from pathlib import Path; import db.supabase as s; print(s._CACHE_PATH)" 在 backend/ 下运行 → 路径指向 analysis/local_cache.json 且 exists。
【人工检查点】操作员亲手拔库复测 a);与 C 约 relay 演习时间(C-M3 后)。
```

## 卡 B-M4 · PDF 生成

```
【角色与边界】同上。系统库安装命令需 sudo 时交人工执行。
【先读】v2-B 册 Phase 4;wiki 05 的 /pdf 节。
【交付】
 1) pdf/generator.py:_esc=html.escape 包装,所有非硬编码插值(公司/分数标签/摘要/flag 各字段/证据 title/org/date/quote/job_id)一律过 _esc——按参考实现共 12 个插值点;五段式 HTML(分数弧/五维+badge/前 3 flag/前 5 证据含权重 bar/方法论表);证据行 dict 与 str 双形状兼容;页脚 "GreenCheck · Greenwashing Detection Engine" + 引擎与标准行;
 2) 路由 /report/{job_id}/pdf:completed 才出 FileResponse(application/pdf),否则 {"error":"Report not ready"};local: 与 relay 两条来源都接。
【完成判据】
 a) curl -s -o /tmp/s.pdf "localhost:8000/api/report/local:Shell/pdf" -w "%{http_code} %{content_type}\n" → 200 application/pdf;head -c5 /tmp/s.pdf → %PDF-;
 b) 构造含 "<script>" 公司名与混合证据(dict+str)的 job 直接调 generate_pdf(写 5 行临时脚本)→ 产物 %PDF- 且 >5KB(贴脚本与输出);
 c) grep -c "_esc(" pdf/generator.py → ≥ 12。
【人工检查点】打开 PDF 肉眼验版;发群挑刺。
```

## 卡 B-M6 · 测试套件 + CI

```
【角色与边界】同上(可修改 .github/workflows/backend-ci.yml,仅允许新增步骤)。
【先读】v2-B 册 Phase 6;现有套件结构(操作员给参考路径时)。
【交付】
 1) tests/test_api.py(health/双字段/空名/严格版 Patagonia 断言:completed+score int+evidence 非空/history 兜底);
 2) tests/test_normalise.py ≈12 条(coerce 四形态/分量存活/_cache_to_job 字符串兜底与 severity/completed+snippet 共存/双命名/空输入不崩);
 3) tests/test_integration_local_cache.py:断库五家公司参数化全字段断言、partial match、local: 往返、PDF 冒烟(注入 payload)、relay 双态(fixture 用 importlib.util.spec_from_file_location 以独立名加载 analysis/main.py,注释写明直接 import main 会撞模块缓存);
 4) CI backend job:pip 前先 apt 安装 libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0;analysis job env 补 SUPABASE 两个占位。
【完成判据】
 SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder ANALYSIS_SERVICE_URL=http://x USE_MOCK=true pytest tests/ -q → "33 passed"(贴完整最后 3 行)。
【人工检查点】随机挑 2 条测试让 agent 讲"钉住了哪个历史 bug";push 看 CI 绿。
```
