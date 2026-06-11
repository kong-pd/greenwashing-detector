# 重建手册 A v2 — 前端(Vercel 部署单元)

> **你是谁**:前端工程师(人类或编码代理均可)。你独立负责 React 单页应用的全部五个屏幕、轮询状态机、Evidence Drawer、降级提示与设计资产接入。
> **你交付什么**:`frontend/` 目录 —— 一个 `npm run build` 产出纯静态文件、经 Vercel rewrites 调用后端的 SPA;13 个 vitest 契约测试 + lint + build 三道门禁全绿。
> **你不碰什么**:任何 Python 文件、Supabase、AI prompt。你与世界的全部接口是 `GET/POST /api/*`(契约:wiki `05-API-Design`)。
>
> **导师提示**:这份手册按"目标 → 为什么 → 怎么做 → 自测 → 完成定义(DoD)"推进。每个 Phase 末尾的自测命令都必须真的跑;跑不绿不进入下一 Phase。看到 `〔联调〕` 标记时,意味着此刻需要与 B/C 对一次暗号,其余时间你完全独立。

---

## 0. 开工前(全员同步段,约 30 分钟,三份手册相同)

### 0.1 跨团队六条硬规则(违反任何一条都会在联调时炸)

1. **前端永远只见对象**:evidence 字符串→对象转换由 B 在 web-service 做掉;你不写任何"如果是字符串就…"的兼容逻辑。
2. **completed 可携带 fail_reason**:`scraping_snippet_fallback` 是与成功共存的数据质量注记;你的代码**先按 `status` 分支**,再看 fail_reason。
3. **snippet 态不是失败**:`isScrapingFailure()` 必须排除它 —— 它绝不触发手动输入 UI,它触发的是"诚实降级 banner"。
4. **AI 判 relevance,工程保下限**:三条权重 bar 直读后端字段 `reliability/recency/relevance`;只有字段缺失(legacy 数据)才回退估算,且必须标 "est."。
5. **结果先写 relay 再写库**(B/C 的事,但你要知道):所以轮询拿到 completed 就是终态,不需要"再确认一次"。
6. **公共 API 永不有意 5xx**:未知 job 返回 `200 + {"error": "Job not found"}`;你的 normalise 对 `raw.error` 返回 null,轮询继续。

### 0.2 必读契约(精确到节,读完再动手)

| 文档 | 必读节 | 你从中拿走什么 |
|------|--------|----------------|
| wiki `05-API-Design` | `/api/analyze`、`/api/report/{job_id}` 全部、Field conventions 表、fail_reason 四值表 | 请求体字段名(`company_name`/`query`/`manual_content`)、双命名响应、错误信封 |
| wiki `10-Evidence-Pipeline` | Evidence Object — Full Schema、Weight Component Schema、Error States | evidence 对象 11 个字段、三分量语义、"est." 回退规则 |
| wiki `02-Functional-Requirements` | FR-02/04/29/34/37 | 上传、手动回退、history、badge、防夹具泄漏 |
| wiki `03-NFR` | Frontend Fault Tolerance、Scraping Fault Tolerance | 超时 60s、轮询 3s、各失败态文案归属 |

### 0.3 环境

```bash
node -v          # ≥ 20
cd frontend && npm ci
npm run dev      # vite, http://localhost:5173,/api 代理到 :8000(见 vite.config.js)
```

---

## 里程碑总览(与 B/C 共用一根脊柱)

| 里程碑 | 你交付 | 验收口令(联调时喊的话) |
|--------|--------|--------------------------|
| **M0 骨架可起** | 五屏路由空壳 + 设计资产渲染 | "5173 能开,五个屏能切" |
| **M1 端到端 mock** | Landing 输入 → Analysis 轮询 → Report 渲染(吃 B 的固定假数据) | "假 Shell 全程跑通" |
| **M2 真实与失败** | 三种失败/降级 UI:not_found、blocked → 手动输入;snippet → banner | "拔了 Serper 也有像样的界面" |
| **M3 韧性** | 超时兜底、AbortController、history 接入 | "60 秒不回我有交代" |
| **M4 报告体验** | 五维 bar+badge、flag 严重度边框、Evidence Drawer、打印 PDF 入口 | "报告页可以拿给设计师看" |
| **M5 可解释与可审计** | Drawer 三分量直读 + est. 回退;flag SOURCE 点击跳证据;两处降级提示 | "评审问'为什么是 0.87'我能点给他看" |
| **M6 门禁** | vitest 13 绿 + lint 0 error + build 过 | "CI 全绿" |

> **并行性说明(协作效率的关键)**:M0 你完全独立。M1 只需要 B 的一句话契约(见 Phase 2 的〔联调〕);之后 M2–M5 你全部可以拿 wiki 05 的响应示例造本地假数据推进,**不等 B/C 写完**。真接口一通,把假数据源换成 fetch 即可。

---

## Phase 0 — 仓库与设计资产(M0)

**目标**:空壳跑起来,设计资产原样接入。

**为什么**:`index.css`(设计 token)+ `SharedComponents.jsx`(ScoreDial/DimensionBars/FlagCard/StandardBadge 等)+ `Interactions.jsx`/`TweaksPanel.jsx` 是**受保护设计资产**——直接拿,不重写、不"顺手优化"。它们替你省掉前端最磨人的部分;改它们会同时破坏 A/B 的视觉一致性和 lint 基线(advisory 规则对这些文件已定为 warning)。

**做什么**:
1. `npm create vite@latest frontend -- --template react`,Node 20,React 19。
2. 原样拷入:`src/index.css`、`src/components/SharedComponents.jsx`、`src/components/Interactions.jsx`、`src/components/TweaksPanel.jsx`、`src/data.js`(Petrovera 演示夹具)、`src/toast.js`。
3. `vite.config.js` 配 `/api` 代理到 `http://localhost:8000`;`vercel.json` 配 rewrites 指向生产 web-service(模板见仓库根)。
4. `App.jsx` 建路由状态机(无 router 库,用 `useState` 路由对象):`landing / company / analysis / report / reports / watchlist`。

**自测**:`npm run dev` 五屏可切换;`npm run build` 通过。
**DoD**:✦ 五屏空壳 ✦ 设计资产 0 修改 ✦ build 绿。

---

## Phase 1 — Landing 与输入分流(M0→M1 前半)

**目标**:三 Tab 输入(Company / Claim / Report PDF),校验与提示。

**怎么做**:
1. Tab 配置含五家预载公司 hints:`Shell, H&M, Patagonia, Tesla, BP`(这五家是 C 的本地缓存夹具,断网也出完整报告 —— 你的演示底气)。
2. 空输入:提示"Enter a company name…",3 秒自动消失,焦点回输入框。
3. **FR-02 上传**:仅 PDF、≤10MB;`FileReader.readAsText` 取文本 → 以 `_manualContent` 挂在 claim 上传给 Analysis 屏(后端拿到 `manual_content` 会跳过抓取)。
4. **FR-37(防夹具泄漏,历史上真踩过的坑)**:为外部公司构造 claim 时**绝不** spread `GWD_DATA.CLAIMS[0]`。写一个 `makeLiveClaim(companyName)` 返回全零/全空模板(score 0、flags []、evidence []、五维全 0)。Petrovera 的旗子混进真实公司报告 = 事故。

**自测**:输入任意名字能进入 Analysis 屏(此刻接口可以还不存在,屏幕挂起没关系)。
**DoD**:✦ 三 Tab 行为齐 ✦ makeLiveClaim 单元可被 import(后面测试要用)。

---

## Phase 2 — Analysis 屏:轮询状态机(M1 核心)

**目标**:`POST /api/analyze` → 轮询 `GET /api/report/{job_id}` → 完成转 Report。

**为什么这样设计**:分析要 30–60 秒,同步请求必超时;所以 B 返回 `{job_id, status:"processing"}`,你每 3 秒轮询一次,60 秒为限。这是全项目的心脏,值得慢慢写对。

**怎么做(逐条)**:
1. 常量:`POLL_INTERVAL_MS = 3000`,`API_TIMEOUT_MS = 60000`。
2. `runFetch` 用 **AbortController**:屏幕卸载/重试时 `abort()`,旧请求的 setState 不得落在新屏上(否则会看到"幽灵报告")。
3. 响应三分支:
   - `status === "completed"` 或带 `score` → `normalise()` 后 700ms 转 Report(留给管线动画收尾);
   - `status === "failed"` → 读 `fail_reason` 走 Phase 3;
   - 其余 → 显示 `step` 文案继续轮询。
4. **`normalise(raw, demoClaim)` 是你最重要的纯函数**,必须 `export`(测试要 import)。行为契约:
   - `raw` 为空或含 `error` 键 → 返回 `null`(轮询继续,不报错);
   - 双命名兼容:`riskLevel || risk_level`、`dimensionScores || dimension_scores`;
   - flags 每条保证有 severity(缺失按类型推断:Data Contradiction/Negative News→high,Vague Claims/Lack of Certification→medium,其余 low);
   - **FR-37**:score/flags/evidence 只来自 raw,缺了就是 0/[]/[],绝不从 demoClaim 补;
   - **透传降级标记**:`failReason: raw.fail_reason ?? null`,并派生 `contentSource: fail_reason === "scraping_snippet_fallback" ? "snippet" : "page"`。
5. 管线动画 trace 行如实标注引擎:`POST generativelanguage.googleapis.com model=gemini-2.5-flash-lite`、`POST google.serper.dev/news …`。**全 UI 不出现任何未在用的模型名** —— 标注与现实一致是这个产品的人设。

〔联调 · M1 暗号〕向 B 要一句话:"`POST /api/analyze` 已按 wiki 05 返回 processing/completed 两态"。在那之前,你用 wiki 05 的 completed 示例 JSON 建 `src/__mocks__/report.json` 顶着写,接口一好就删。

**自测**:对着 B 的 mock(或你的本地 JSON)走完 输入→轮询→Report。
**DoD**:✦ AbortController 生效(切屏无警告)✦ normalise 已 export ✦ 假 Shell 全程通。

---

## Phase 3 — 失败与降级三态(M2)

**目标**:两种硬失败 → 手动输入;一种软降级 → 诚实 banner。这是产品"可信"人设的脸面。

**怎么做**:
1. `SCRAPING_FAIL_COPY` 两套文案(必须可区分):
   - `scraping_not_found` → "ESG page not found / 没找到,可粘贴内容或给 URL";
   - `scraping_blocked` → "Access blocked / 找到了但进不去,请粘贴内容"。
   `scraping_failed` 作 legacy 兜底映射到 blocked 文案。
2. `isScrapingFailure(reason)` 只认 `["scraping_not_found","scraping_blocked","scraping_failed"]` —— **显式排除 `scraping_snippet_fallback`**(硬规则 3,有测试钉着)。
3. **ManualInputFallback** 组件:textarea + 文件位 + 提交即带 `manual_content` 重新 `POST /api/analyze`。注意:若用户已经走过 manual(`manualContent` 非空)再失败,不再循环弹手动输入,直接落 demo 模板并提示。
4. **snippet banner(两处)**:
   - Analysis 屏 meta 区:`apiResult?.contentSource === "snippet"` 时加一行 `Source: search snippets · degraded`(暖色)。
   - Report 屏顶部(Phase 5 实装):横幅讲清楚"整页拿不到,本报告基于搜索摘要,分数可能随全文分析变化"。
5. 超时(M3):60s 到 → `setTimedOut(true)`,1.5s 后落 demo 模板转 Report,并 toast 说明。

**自测**:让 B 给你三个可控假 job(或自己 mock 三种轮询响应),逐态过 UI。
**DoD**:✦ 两失败文案可区分 ✦ snippet 不触发手动输入 ✦ 超时有交代。

---

## Phase 4 — Report 屏与 Drawer(M4)

**目标**:报告页五段式(§1 评分 → §2 五维 → §3 flags → §4 evidence → §5 方法论)+ Evidence Drawer。

**怎么做**:
1. §2 五维 bar 每条挂 `StandardBadge`(TCFD / GRI 305 / EU Taxonomy / GRI 2-27 / EU GCD 2024)—— FR-34,评审最先看的合规锚点。
2. §3 `FlagCard`:左边框颜色按 severity(high 红/medium 琥珀/low 绿),编号 F-01…;**给它加可选 prop `onSourceClick`** —— 提供时 SOURCE 行渲染成按钮(下划虚线 + →),这是 M5 跳转的挂点。
3. §4 evidence 按 weight 降序列前 5,"Open full trail →" 打开 Drawer。
4. **EvidenceDrawer**(注意一个历史 bug):Hook 必须无条件先跑,early return 放 Hook 之后。选中态用"受控 id 派生":
   ```jsx
   const [picked, setPicked] = useState(null);           // {forEv, id}
   const localId = picked && picked.forEv === (ev?.id ?? null) ? picked.id : null;
   const selected = (localId && evidence.find(e => e.id === localId)) || ev || evidence[0];
   if (!claim || !selected) return null;
   ```
   这样 `ev` prop(flag 跳转送进来的目标)天然生效,用户再点列表项又能覆盖,且无 setState-in-effect。
5. 打印 PDF 入口:改 `document.title` 为 `{公司}_{id}_credibility_report` 后 `window.print()`,完事还原。后端 PDF 下载按钮指 `GET /api/report/{job_id}/pdf`。
6. 页脚正式品牌行:`GreenCheck · Greenwashing Detection Engine · Evidence-weighted ESG claim analysis`(全项目无任何赛事标识)。

**DoD**:✦ 五段齐 ✦ Drawer 列表/详情联动 ✦ FlagCard 支持 onSourceClick。

---

## Phase 5 — 可解释与可审计(M5,本产品的灵魂)

**目标**:三条权重 bar 读真数据;flag 一键跳证据;降级 banner 落位。

**怎么做**:
1. **`weightFactors(ev)`(export 的纯函数)**:
   - 真值优先:`typeof v === "number" && v>=0 && v<=1` 则用 `ev.reliability / ev.recency / ev.relevance`,`est:false`;
   - 缺失回退:reliability 按 kind 启发式(Filing/Database .92,Document .78,News .65,Linguistic .55);recency **必须先用 `/^\d{4}-\d{2}-\d{2}/` 验 ISO** 再做字符串比较 —— 历史 bug:`"Unknown" >= "2026-01-01"` 字典序为真,未知日期被当成最新;非 ISO 一律 0.5;relevance 回退 `ev.weight ?? 0.5`;
   - 回退项 `est:true`,UI 渲染 ` · est.` 小字 —— 诚实标注是产品原则,不是装饰。
2. **`findEvidenceForFlag(flag, evidence)`(export)**:flag.source 是自由文本("EU ETS Union Registry 2024; Shell Memorandum"),对 evidence 的 `org+title+url` 做小写 token(长度≥3)重叠计分,**最佳分且 ≥2 命中**才返回 —— 单个泛词("report")跳错比不跳更伤信任。Report 屏接线:命中 → `onOpenEvidence(claim, match)` 打开 Drawer 定位;未命中但有证据 → 开整体 trail + toast;无证据 → toast 说明。
3. Report 顶部降级 banner(Phase 3 第 4 点的正式版):`claim.contentSource === "snippet"` 时渲染,role="status",措辞照 wiki 03 的表。

**DoD**:✦ 三 bar 对五家缓存公司显示真值且无 est. ✦ 造一条缺字段 evidence 显示 est. ✦ flag 点击能落到正确证据。

---

## Phase 6 — 测试与门禁(M6)

```bash
npm i -D vitest
# package.json: "test": "vitest run", "lint": "eslint ."
```

建 `src/__tests__/contracts.test.jsx`,**13 条最小集**(逐条对应硬规则):
- normalise:error→null;FR-37 不泄漏;snake_case 映射+severity 推断;completed+snippet 共存→contentSource;page 默认。
- weightFactors:真值直读且 est 全 false;legacy 回退且 est 全 true;`"Unknown"/""` 日期回归(必须 0.5)。
- findEvidenceForFlag:正确解析;单泛词不跳;空输入不崩。
- 失败文案:两硬失败文案不同;`isScrapingFailure("scraping_snippet_fallback") === false`。

ESLint 10 需要 `eslint.config.js`(flat config):react-hooks 正确性规则保持 error;React-19 advisory(refs/setState-in-effect/static-components)对受保护设计资产降为 warn。

**最终验收(可由 agent 自动执行)**:
```bash
cd frontend && npm ci && npm run lint && npm test && npm run build
# 期望:lint 0 error · 13 passed · build ✓
```

---

## 坑与回退(症状 → 原因 → 处理)

| 症状 | 原因 | 处理 |
|------|------|------|
| 真公司报告里冒出 Petrovera 的 flag | spread 了演示夹具(FR-37) | makeLiveClaim/normalise 双闸,测试钉死 |
| 切屏后控制台 setState 警告 / 报告闪旧数据 | 轮询没 abort | AbortController + 卸载 cleanup |
| 未知日期的证据 recency 显示 95 | 字典序比较 "U">"2" | ISO 正则守卫(已有回归测试) |
| Drawer 偶发白屏 | Hook 在 early return 之后 | 受控 id 派生写法(Phase 4 第 4 点) |
| snippet 报告弹出手动输入 | isScrapingFailure 误含 snippet 值 | 硬规则 3;跑 vitest 那条会红 |
| lint 一片红全在 Interactions/TweaksPanel | React19 advisory 规则撞设计资产 | 这些文件只 warn;**不要去改设计资产** |

## 给后来者的一句话

这个前端的难点从来不是组件,而是**对后端真实状态的诚实呈现**:失败要分得清、降级要说出口、权重要点得开。把 normalise 和三个 export 的纯函数当成你的公共 API 来维护,其余都是排版。
