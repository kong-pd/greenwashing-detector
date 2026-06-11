# 重建手册 C v2 — 分析服务(Railway analysis-service 部署单元)

> **你是谁**:算法/管线工程师(人类或编码代理均可)。你独立负责 analysis-service:抓取(含 snippet 降级)、证据组装、九层 AI fallback 链、权重三分量、结果落库与 NFR-09 relay 的**写侧**。
> **你交付什么**:`analysis/` 目录 —— 50 个 pytest(含 FakeDB 管线集成)全绿;`local_cache.json` 五家公司满配证据;任意公司名进来,**九层链路保证总有一层接住**。
> **你不碰什么**:HTTP 对外契约(B 的)、前端。你与世界的接口只有两个:写 Supabase/relay 的 job 形状(wiki 06)、被 B 触发的 `POST /run` 与被 B 回查的 `GET /result/{id}`。
>
> **导师提示**:这份手册的灵魂是两条产品原则 —— **证据由工程组装,AI 只判相关性**(防幻觉引用);**降级要诚实标注,而不是悄悄凑合**(snippet 态)。每个 Phase 都在落实这两条。

---

## 0. 开工前(全员同步段,与 A/B 相同)

### 0.1 跨团队六条硬规则
同 wiki `11-Rebuild-Playbook`。对你最致命的是 **3**(snippet 永不遮蔽 blocked)、**4**(权重公式与 Tier-1 名单以 wiki 10 为唯一定义,你的代码与 fixture 与其逐字一致)、**5**(先写 relay 再写库)。

### 0.2 必读契约
| 文档 | 必读节 | 拿走什么 |
|------|--------|----------|
| wiki `08-Prompt-Design` | 全文 | **system prompt 照抄,一字不改**;输出 schema;Post-AI composition 注记 |
| wiki `10-Evidence-Pipeline` | 全文(你就是它) | 四阶段管线、evidence 11 字段、**Weight Component Schema(权威)**、snippet 语义表 |
| wiki `06-Database-Schema` | analysis_jobs / analysis_flags 字段、env | 你写库的形状 |
| wiki `05-API-Design` | fail_reason 四值表、Resilience 段 | 你产出的状态语义 |

### 0.3 环境

```bash
python3 -m venv venv && source venv/bin/activate
pip install fastapi uvicorn python-dotenv httpx supabase playwright \
            google-generativeai anthropic pytest pytest-asyncio
playwright install chromium
cp .env.example .env   # GEMINI/GROQ 必填其一即可起步;SERPER 管真实抓取;其余可占位
uvicorn main:app --port 8001 --reload
```

---

## 里程碑总览

| 里程碑 | 你交付 | 验收口令 |
|--------|--------|----------|
| **M0** | `/health`、`/run` 受理即回 | "8001 活了,/run 不阻塞" |
| **M1** | USE_MOCK 全管线:收 job → 落库 completed(B 能轮到) | "mock 公司 5 秒出报告" |
| **M2** | 真实抓取(两硬一软三态)+ enricher(Serper 主 + Guardian 补) | "拔 Playwright 也走得下去" |
| **M3** | 九层 AI 链 + 错误分类日志 + **relay 写侧** + 本地缓存 Layer-8 | "拔 Gemini 拔 Groq 拔 DB,还活着" |
| **M5** | 权重三分量 + Tier-1 floor + `local_cache.json` 满配 | "0.87 = 0.45·0.90+0.20·0.65+0.35·0.95,我能背" |
| **M6** | pytest 50 绿(含 FakeDB 集成) | "CI 全绿" |

>(注:M4 报告体验是 A/B 的里程碑,你在 M4 无交付,正好用来打磨 M5。)
>
> **并行性**:M0–M1 只需要 B 的表存在(或干脆 FakeDB 测试推进,连表都不等);M2 起完全独立。**你是三人中最早能"全绿收工"的,主动把省下的时间投给 local_cache 内容质量 —— 它是所有人的演示底气。**

---

## Phase 0 — 骨架与受理(M0)

1. `main.py`:FastAPI;Windows 兼容头(`WindowsProactorEventLoopPolicy`,Playwright 需要);`/health` 返回 `{"status":"ok","service":"analysis"}`。
2. `POST /run`:Pydantic `RunRequest(job_id, company_name, manual_content|None)`;**立即** `asyncio.create_task(process(req))` 并返回 `{"status":"started"}` —— B 给你的 timeout 只有 5 秒,受理与执行必须分离。

---

## Phase 1 — Mock 全管线 + 落库形状(M1)

**目标**:`USE_MOCK=true` 时 `process()` 四步走完,B 的轮询能看到 completed。

1. `process()` 四步:取内容(manual_content 优先)→ enrich → analyze → save。每步前 `update_step(job_id, 文案)`(写库失败只打日志)。
2. `save_result(job_id, result, company_name)` 写库形状(**逐字段对齐 wiki 06**,B 的 `get_job` 只认这些):
   `status/score/risk_level/summary/sources(=evidence 对象数组, JSONB)/dimension_scores/completed_at`;flags 逐条插 `analysis_flags`,**每条必有 severity**(缺失按类型推断:Data Contradiction、Negative News→high;Vague Claims、Lack of Certification→medium;其余 low)。
3. `save_failed(job_id, reason)`:status=failed + fail_reason。
4. `MOCK_RESULT`:一份带 `[MOCK]` 前缀的完整结果(应急演示层,Layer-1/9 共用)。

〔联调 · M1 暗号〕对 B:"mock 公司已能 completed,字段照 06,去轮。"

**自测**(FakeDB 思路,这是你整个测试体系的地基):
```python
# tests 里造一个记录 update/insert 调用的 FakeDB,monkeypatch get_db
# 断言最后一次 analysis_jobs update 的 payload 含全部七字段、flags 三条且 severity 齐
pytest tests/test_pipeline_integration.py::test_pipeline_completes_and_writes_table_contract -q
```

---

## Phase 2 — 抓取三态与证据组装(M2)

### 2.1 scraper:两硬一软

**为什么有"软"态**:Playwright 被反爬挡住是常态,但 Serper 搜索时**已经拿到了 organic 摘要** —— 扔掉它们直接让用户手动粘贴,是把可用信息浪费掉。于是:

```python
SNIPPET_MIN_CHARS = 200
SNIPPET_FALLBACK  = "scraping_snippet_fallback"   # 跨团队契约字符串,一个字都不能差

async def scrape(company) -> tuple[str|None, str|None]:
    # (text, None)              整页成功
    # (text, SNIPPET_FALLBACK)  被挡但摘要拼接≥200字 → 降级继续
    # (None, "scraping_not_found")  搜不到链接/页面空
    # (None, "scraping_blocked")    被挡且摘要太薄 → 手动输入路径
```

实现要点:
1. `_search_esg(company) -> (best_url, organic_results)`:Serper `/search`,优先含 ESG 关键词(sustainability/esg/environment/carbon/climate/green)的链接,否则第一条;**organic 结果保留**备降级。
2. Playwright:UA 头、`domcontentloaded` + 3s 等待、`inner_text("body")`、截 8000 字;<50 字按 not_found。
3. 被挡路径统一进 `_snippet_or_blocked`:`_assemble_snippet_content` 把 organic 的 `title: snippet` 逐条拼接,带头部声明 `[Search-snippet digest for X — full page was inaccessible…]`;**≥200 字才算可用**,否则维持 blocked。**硬规则 3 的实现位:阈值判定就是"snippet 不遮蔽 blocked"的保险丝。**

### 2.2 main.py 接线(中间态语义)

```python
if fail_reason == SNIPPET_FALLBACK:
    mark_degraded(job_id, fail_reason)   # 只写 fail_reason,status 保持 processing
# 然后照常 enrich → analyze → save_result
# save_result 不碰 fail_reason 列 → 注记在 completed 后存活 → A 的 banner 有据可依
```

### 2.3 enricher:工程组装证据(防幻觉的根)

1. 主源 Serper News(q = `"{company} greenwashing OR sustainability OR ESG"`,取≤5,过滤无 link/removed);**补源 Guardian**:Serper <3 条时补到 5。
2. 每条产出 11 字段对象骨架(weight 先置 None,M5 填三分量):quote 取 snippet/trailText,20–300 字,剥 `[+N chars]` 尾巴;**日期归一**:`"Mar 12, 2024"`、`"2 days ago"` 等 → ISO;**解析不出就给空串,绝不给 "Unknown"**(下游 recency 对空串=0.50;"Unknown" 曾在前端字典序比较里被当成最新,血泪)。
3. 合并去重、上限 5、`_reindex` 统一编号 E-01…。
4. CDP stub:返回一段明示"无数据,且**不得因缺数据扣 Data Consistency 分**"的指令文本 —— 没有这句,模型会替你脑补惩罚。

**自测**:
```bash
pytest tests/test_snippet_fallback.py tests/test_weight_components.py -k "serper or quote or snippet" -q
```
**DoD**:✦ 三态可被单测枚举 ✦ 摘要薄时 blocked 不被吃掉 ✦ 日期无 "Unknown"。

---

## Phase 3 — 九层 AI 链 + relay 写侧(M3,生存能力)

### 3.1 链序与理由(免费在前、独立供应商兜底、付费可选)

```
① USE_MOCK   ② Gemini 2.5 Flash-Lite(1000/天)③ Gemini Flash(250)④ Gemini Pro(100)
⑤ Groq Llama 3.3 70B(独立供应商,1000/天) ⑥ Groq 3.1 8B
⑦ Claude Sonnet(可选付费) ⑧ local_cache.json ⑨ 通用 MOCK
```

实现纪律:
- system prompt 从 wiki 08 **整段照抄**;`_parse_json` 剥 ```` ```json ```` 围栏再 loads。
- **错误分类日志**(没有它,凌晨三点你不知道该换 key 还是该等配额):`[CONFIG_ERROR]`(auth,**直接放弃本供应商**不试下一型号)/`[TRANSIENT]`(quota/429/503,试下一层)/`[PARSE_ERROR]`(坏 JSON,试下一层)/`[UNKNOWN]`。
- Groq 走裸 HTTP(OpenAI 兼容),省一个依赖;key 缺失/占位(`your_` 前缀)整链静默跳过。
- Layer-8 本地缓存:**deepcopy 再补字段**(原地改会污染模块级缓存,跨请求互相串味 —— 真实 bug);legacy 字符串 sources 也走对象化。

### 3.2 `_process_result` 加固(别信模型的自我汇报)

- score:转 int 夹 0–100;转不动就按五维求和。
- risk_level:不在三值枚举、或与阈值(≤30 Low / ≤60 Medium / 其余 High)不符 → **按分数派生覆盖**。
- evidence:AI 给了用 AI 的(它带 relevance 判断),AI 漏了用输入证据;统一过 `_normalise_evidence`(Phase 4)。

### 3.3 relay 写侧(NFR-09,与 B 的读侧合龙)

```python
_RELAY_MAX = 50;  _RELAY: dict[str, dict];  _RELAY_ORDER: list[str]   # FIFO 淘汰
# update_step / save_failed / mark_degraded / save_result 全部【先写 relay】
# save_result 的 relay 记录 = 完整 job 形状(含 analysis_flags 列表、company_name)
@app.get("/result/{job_id}")  # 有→原样吐;无→ {"status":"unknown"}
```
语义:**库写失败只打日志,报告照样经 B 的回查到达用户。** 把"先 relay 后库"的顺序写进注释 —— 顺序反了,崩在两步之间就两头空。

**自测**:
```bash
pytest tests/test_pipeline_integration.py -q   # 含 relay 双态、淘汰上界、降级中间态、两硬失败、analyzer None
```
**DoD**:✦ 拔任一 AI 供应商链路仍走通 ✦ FakeDB 全炸时 relay 里仍是 completed。

---

## Phase 5 — 权重三分量(M5,技术评审追问的主战场)

### 5.1 公式(wiki 10 权威,代码与 fixture 与其逐字一致)

```
weight = clamp_band( 0.45·reliability + 0.20·recency + 0.35·relevance )

reliability:kind 基准 Filing .90 / Database .86 / News .60 / Document .55 / Linguistic .45
            News 且 org ∈ Tier-1{reuters, financial times, ft, bloomberg, the guardian,
            guardian, bbc, associated press, ap, wall street journal, wsj,
            the new york times, new york times, nyt} → floor 0.85(大小写不敏感、整名匹配)
recency:   分析时刻起 ≤90d→.95  ≤365d→.80  ≤730d→.65  其余/未知→.50
relevance: AI 所赋 weight(它对"这条多直接支持/反驳声明"的语义判断);缺省取 band 中点
band:      Filing(.85,.95) Database(.80,.92) News(.40,.80) Document(.45,.65) Linguistic(.30,.55)
```

`_normalise_evidence` 对每条:算三分量 → 合成 → clamp → **三分量随对象一起存**(round 2dp)→ 按 weight 降序。**prompt 一字不改** —— "AI 判 relevance、工程保下限与带宽"全部活在后处理,这正是它可审计的原因。

### 5.2 `local_cache.json` 满配(全队的演示底气)

五家公司(shell / h&m / patagonia / tesla / bp)各 4–5 条**完整 evidence 对象**(11 字段含三分量),内容要求:
- 与该公司既有 flags **逐条对应**(flag 引用的机构在证据里找得到 —— A 的 flag→evidence 跳转靠 token 匹配,你内容对不上它就跳空);
- URL 用机构真实门户级地址(climate.ec.europa.eu / asa.org.uk / sciencebasedtargets.org / cdp.net / bcorporation.net / reuters.com…),**不编造深层文章路径**(夹具诚实原则,与 Petrovera 同性质);
- weight 用 5.1 公式以固定参考日计算后冻结,**全部通过 band 断言**;
- 保留 legacy `sources` 字符串数组不删(向后兼容路径的活体测试样本)。

写个一次性 builder 脚本生成 + 校验(band 内、分量 0–1、E-01 起连号),别手敲 JSON。

**自测**:
```bash
pytest tests/test_weight_components.py -q   # 公式逐项:floor 不漏到非 News、recency 档位边界(90/91、365/366、730/731)、
                                            # 极端输入永在带内、缺省=中点、分量齐全且降序、score/risk 加固
python3 - <<'P'
import json; c=json.load(open('local_cache.json'))
for k,v in c.items(): assert all({'reliability','recency','relevance'} <= set(e) for e in v['evidence']), k
print('fixture 满配 OK')
P
```
〔联调 · M5 暗号〕对 B→A:"Shell E-01 三分量 0.90/0.95/0.85→weight 0.89,链路验收开始。"

---

## Phase 6 — 测试与 CI(M6)

50 条的骨架:
- `test_analyzer.py`(基础 16):缓存查找四式、mock 链不崩、clamp、enricher 返回 list。
- `test_weight_components.py`(~25):Phase 5 自测清单 + `_parse_json` 围栏 + 日期归一 + quote 边界。
- `test_snippet_fallback.py`(7):契约串相等、拼接/阈值/空摘要、blocked 保留、边界长度。
- `test_pipeline_integration.py`(~10):Phase 1/3 的 FakeDB 全家桶 + relay 端点/淘汰。

CI(analysis job):pip 装 playwright **包即可,不必 install 浏览器**(单测不真开);env 给全占位含 SUPABASE 两项(集成测试 import main 会摸 get_db)。

**最终验收(agent 可自动执行)**:
```bash
cd analysis && USE_MOCK=true SUPABASE_URL=https://placeholder.supabase.co \
SUPABASE_ANON_KEY=placeholder pytest tests/ -q        # 50 passed
```

---

## 坑与回退

| 症状 | 原因 | 处理 |
|------|------|------|
| snippet 报告把手动输入顶没了 | 阈值判定缺失/标记串拼错 | `SNIPPET_FALLBACK` 常量化;阈值测试钉死 |
| completed 后 banner 不见 | save_result 把 fail_reason 一起 update 了 | save_result **不碰**该列 |
| 第二次查同一公司缓存数据变样 | Layer-8 原地改模块级缓存 | deepcopy |
| 前端三 bar 全 est. | `_normalise_evidence` 重组对象没带分量 | 三分量是输出 schema 的一部分 |
| "Unknown" 日期证据显示最新 | enricher 给了 "Unknown" | 空串约定 + `_recency("")=0.50` |
| 模型 risk_level 与分数打架 | 直接透传模型标签 | `_process_result` 按阈值派生覆盖 |
| 拔 Gemini 后整链卡死在重试 | auth 错误也按 transient 重试 | CONFIG_ERROR 直接弃供应商 |
| flag 点击跳空 | fixture 证据与 flags 机构对不上 | 5.2 第一条:内容逐条对应 |

## 给后来者的一句话

这条管线的护城河不是模型,是**纪律的层叠**:证据工程组装、相关性才交给 AI、每个失败都有名字、每次降级都说出口、每个结果先进 relay。模型可以一夜换三个,这套纪律换不得。
