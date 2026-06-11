# Agent 任务卡 · C 轨(分析服务)

> 操作员使用说明同 A 轨卡首。涉及外部 API 密钥(Gemini/Groq/Serper/Guardian)的获取与填入 `.env` 均为**人工步骤**;agent 永远以占位值开发与测试。

---

## 卡 C-M0 · 骨架与"受理即回"

```
【角色与边界】你是 GreenCheck 的 analysis agent,只允许创建/修改 analysis/ 下的文件。先读仓库根 AGENTS.md。
【先读】v2-C 册 Phase 0;wiki 05 的 /run 触发语义(B 侧 timeout 仅 5 秒)。
【交付】
 1) analysis/ venv + 依赖(fastapi uvicorn[standard] python-dotenv httpx supabase playwright google-generativeai)→ pip freeze > requirements.txt(不引入 weasyprint——分析服务不出 PDF);
 2) main.py:load_dotenv;/health → {"status":"ok","service":"analysis"};RunRequest(job_id, company_name, manual_content|None);POST /run 用 asyncio.create_task(process(req)) 立即返回 {"status":"started"};process 先打日志占位。
【完成判据】
 a) curl -s localhost:8001/health → {"status":"ok","service":"analysis"};
 b) time curl -s -X POST localhost:8001/run -H 'Content-Type: application/json' -d '{"job_id":"t1","company_name":"Acme"}' → 返回 started 且 real 耗时 < 1s(受理与执行分离的实证),终端可见 process 日志。
【人工检查点】操作员确认 requirements.txt 无 weasyprint、无真实密钥。
```

## 卡 C-M1 · Mock 全管线 + 落库形状契约

```
【角色与边界】同上。
【先读】wiki 06 的 analysis_jobs / analysis_flags 字段表;v2-C 册 Phase 1。
【交付】
 1) get_db / update_step / save_failed / save_result(job_id, result, company_name):写库字段逐字对齐 wiki 06(status/score/risk_level/summary/sources=evidence 对象数组/dimension_scores/completed_at;flags 逐条插入且每条必有 severity——缺失按映射推断:Data Contradiction|Negative News→high,Vague Claims|Lack of Certification→medium,其余 low);所有写库 try/except 仅日志;
 2) MOCK_RESULT(带 [MOCK] 前缀的完整结果,3 条 flags 覆盖三档 severity);
 3) process() 四步:取内容(manual_content 优先)→ enrich 占位 → USE_MOCK 时取 MOCK_RESULT → save_result;任何异常 → save_failed("analysis_failed")。
【完成判据】
 a) tests/test_pipeline_integration.py 起手一条:FakeDB(记录 update/insert 调用的假 supabase client)+ monkeypatch get_db + asyncio.run(process(...,manual_content="x"*200)),断言最终 update 含全部七字段、analysis_flags 三条 insert 且 severity ∈ {high,medium,low} → USE_MOCK=true SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder pytest tests/ -q 全绿(贴输出);
 b) 与 B 联机(或 B 用 Table Editor 手验):一个 /run 任务最终在表里 completed。
【人工检查点】操作员对照 wiki 06 念一遍七个字段;在群里和 B 互喊 M1 暗号。
```

## 卡 C-M2 · 抓取三态(snippet 降级)+ enricher

```
【角色与边界】同上。
【先读】wiki 10 的 Stage 1 失败与降级表 + Stage 2;wiki 03 的 Scraping Fault Tolerance;v2-C 册 Phase 2-3;AGENTS.md 硬规则 3。
【交付】
 1) scraper.py:常量 SNIPPET_MIN_CHARS=200、SNIPPET_FALLBACK="scraping_snippet_fallback"(逐字);_search_esg 返回 (best_url, organic_results)(ESG 关键词优先,organic 保留备降级);Playwright 抓取(UA 头/20s/domcontentloaded+3s/inner_text/截 8000,<50 字按 not_found);被挡统一进 _snippet_or_blocked:_assemble_snippet_content 拼 "title: snippet" 带 digest 头,≥200 字 → (text, SNIPPET_FALLBACK),否则 (None,"scraping_blocked");
 2) main.py:mark_degraded(job_id, reason) 只写 fail_reason 不动 status;process 接线——content 为 None → save_failed(具体 reason);fail_reason==SNIPPET_FALLBACK → mark_degraded 后继续;save_result 不得触碰 fail_reason 列;
 3) enricher.py:Serper News 主源(q="{company} greenwashing OR sustainability OR ESG",≤5,滤无 link)+ Guardian 补到 5;每条 11 字段对象(weight 置 None);_extract_quote(20–300 字,剥 "[+N chars]");_normalise_serper_date(相对/英文日期→ISO,解析不出给 "" 绝不给 "Unknown");_reindex E-01…;CDP stub 文案必须含"不得因缺数据扣 Data Consistency 分"。
【完成判据】
 a) tests/test_snippet_fallback.py ≥7 条:契约串相等断言/拼接含公司名/太薄→None/无 snippet→None/blocked+富摘要→(text,SNIPPET_FALLBACK)/blocked+空→(None,"scraping_blocked")/阈值边界 → 全绿(贴输出);
 b) 日期与 quote 各 ≥2 条单测("2 days ago"→ISO;""→"";短文 None;500 字截 300)→ 全绿;
 c) grep -rn '"Unknown"' analysis/*.py → 不得出现在 date 取值路径(贴输出说明)。
【人工检查点】操作员口述"为什么 200 字以下必须维持 blocked"(硬规则 3)。
```

## 卡 C-M3 · 九层 AI 链 + relay 写侧

```
【角色与边界】同上。
【先读】wiki 08 全文(prompt 照抄一字不改);wiki 03 NFR-09;v2-C 册 Phase 3.1–3.3;AGENTS.md 硬规则 5。
【交付】
 1) analyzer.py:_parse_json 剥 ``` 围栏;链序 USE_MOCK→Gemini flash-lite→flash→pro→Groq 70B→Groq 8B(裸 HTTP,OpenAI 兼容)→Claude(可选)→local_cache→MOCK;错误分类日志 [CONFIG_ERROR](auth,弃该供应商全部型号)/[TRANSIENT]/[PARSE_ERROR]/[UNKNOWN];key 缺失或 your_ 前缀静默跳过该层;Layer-8 命中 deepcopy 后再补字段,legacy 字符串 sources 走对象化;
 2) _process_result 加固:score int 夹 0–100(转不动按五维求和);risk_level 非法或与阈值(≤30/≤60)不符 → _derive_risk_level(score) 覆盖;
 3) main.py relay 写侧:_RELAY_MAX=50 FIFO;_relay_put;update_step/save_failed/mark_degraded/save_result 四函数【先写 relay 再写库】(save_result 的 relay 记录为完整 job 形状含 company_name 与 analysis_flags);GET /result/{job_id} 有则原样、无则 {"status":"unknown"}。
【完成判据】
 a) 单测:score=142+错标签→100/High;score 缺失→五维求和;_parse_json 三式;_derive 边界(30/31/60/61)→ 全绿;
 b) tests/test_pipeline_integration.py 补:snippet 中间态(假 scrape 返回 (text,SNIPPET_FALLBACK))→ FakeDB 里先有 {"fail_reason":...} 的 update、最终 update status=completed,且 relay 记录 status=completed 与 fail_reason 并存;两硬失败参数化;analyze 返回 None→analysis_failed;relay unknown 端点;relay 50 条 FIFO 淘汰 → 全绿(贴输出);
 c) grep -n "_relay_put" main.py → 四个写函数内各一处且位于 DB 调用之前(贴行号)。
【人工检查点】与 B 做断库演习:两侧 placeholder URL,B 发起新公司,B 日志出现 "relay hit"、报告到家;演完恢复 .env。
```

## 卡 C-M5 · 权重三分量 + local_cache 满配

```
【角色与边界】同上。
【先读】wiki 10 · Weight Component Schema(权威,公式与 Tier-1 名单逐字一致);v2-C 册 Phase 5;AGENTS.md 硬规则 4 与红线"不伪造深层 URL"。
【交付】
 1) analyzer.py:WEIGHT_BANDS/KIND_RELIABILITY_BASE/TIER1_OUTLETS/COMPONENT_WEIGHTS{.45,.20,.35};_reliability(News+Tier1 floor .85,大小写不敏感整名)/_recency(≤90→.95,≤365→.80,≤730→.65,否则 .50)/_clamp(None→band 中点)/_compose;_normalise_evidence:relevance=AI weight(缺省中点),三分量 round2 随对象输出,weight=clamp(compose),按 weight 降序;
 2) build_cache_evidence.py 一次性脚本:五家公司各 4–5 条完整证据(11 字段含三分量,内容与既有 flags 机构逐条对应,URL 仅机构门户级真实地址),用同一公式以固定参考日冻结,脚本内断言全部带内、分量 0–1、E-01 连号;生成/更新 local_cache.json(保留 legacy sources 字符串数组)。
【完成判据】
 a) tests/test_weight_components.py ≥20 条:kind 基准/Tier-1 floor 仅作用于 News/未知 kind 默认/recency 全档位与边界(90|91,365|366,730|731)与 Unknown=.50/极端输入永在带内/已知值点算(News,.85,.95,.90→clamp .80)/None→中点/越界夹取/分量齐全且降序/relevance 缺省中点 → 全绿(贴输出);
 b) python3 一行校验:五家公司每条 evidence 均含三分量键(贴脚本与输出);
 c) USE_MOCK=true …… pytest tests/ -q → 全套绿(目标 50 passed,贴最后两行)。
【人工检查点】操作员抽一条证据手算 0.45r+0.20c+0.35v 对上 weight;与 B→A 走 M5 链路验收暗号。
```

## 卡 C-M6 · 套件封板 + CI

```
【角色与边界】同上(.github/workflows 仅允许按下述新增)。
【交付】CI analysis job:pip 安装含 playwright 包(无需 install 浏览器);env 占位含 SUPABASE_URL/SUPABASE_ANON_KEY 两项;确认 pytest 路径覆盖 analysis/tests。手工联网脚本一律命名 scripts/manual_*.py,不得以 test_ 开头混入收集。
【完成判据】USE_MOCK=true SUPABASE_URL=https://placeholder.supabase.co SUPABASE_ANON_KEY=placeholder pytest tests/ -q → "50 passed"(贴输出);git push 后 CI test-analysis 绿(操作员贴截图)。
【人工检查点】随机挑 2 条测试让 agent 讲"钉住了哪条硬规则";全队 M6 合影。
```
