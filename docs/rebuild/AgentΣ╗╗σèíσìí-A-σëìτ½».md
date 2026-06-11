# Agent 任务卡 · A 轨(前端)

> **给人类操作员的使用说明(2 分钟)**
> 1. 先读 v3-A 册对应 Phase(理解这张卡在干嘛,这是你的学习环节);
> 2. 把下面**一张卡的全文**粘贴给你的 AI 助手(Claude Code / Cursor 等),并确保它已读仓库根 `AGENTS.md`;
> 3. 等它按宪法第 5 节格式汇报 → 你核对「验证输出」是真实终端输出、抽查 1-2 个文件的 diff、回答它的"留给人类"项;
> 4. 自己在本机重跑一遍完成判据(亲手验一次 = 学一次)→ merge → 下一张卡。
> 一次只发一张卡。卡间不要求同一会话,因为每张卡都自带上下文装载清单。

---

## 卡 A-M0 · 项目骨架与设计资产

```
【角色与边界】你是 GreenCheck 的前端 agent,只允许创建/修改 frontend/ 下的文件。先读仓库根 AGENTS.md 并遵守。
【先读】docs/rebuild/重建手册-A-前端-v2.md 的 Phase 0;wiki 07-System-Architecture 的目录结构节。
【交付】
 1) 用 Vite 创建 React 项目(模板 react,非 TS),Node 20;
 2) 从操作员提供的参考实现原样拷入 6 个设计资产文件:src/index.css、src/components/SharedComponents.jsx、src/components/Interactions.jsx、src/components/TweaksPanel.jsx、src/data.js、src/toast.js;
 3) vite.config.js:/api 代理到 http://localhost:8000;
 4) App.jsx:useState 路由对象切换 landing/analysis/report/reports/watchlist 五屏空壳。
【必须遵守】设计资产六文件逐字节等同参考(不得格式化/优化);不引入 react-router 等额外依赖。
【完成判据(逐条运行并粘贴真实输出)】
 a) node -v                          → v20.x
 b) npm run build 2>&1 | tail -2     → 含 "✓ built"
 c) diff -q src/index.css <参考路径>/src/index.css   → 无输出(六个资产文件各跑一次)
 d) 启动 npm run dev 后说明五屏可切(列出你实现的路由 name 清单)
【人工检查点】操作员手点五个屏;确认 package.json 无多余依赖。
```

## 卡 A-M1 · Landing 输入 + 轮询状态机(契约心脏)

```
【角色与边界】同上。
【先读】wiki 05-API-Design 的 /api/analyze 与 /api/report 全节(含 Field conventions、fail_reason 四值表);v2-A 册 Phase 1-2;AGENTS.md 硬规则 2/6。
【交付】
 1) src/screens/LandingScreen.jsx:输入框+Analyze+五个 demo chip(Shell/H&M/Patagonia/Tesla/BP);空输入提示 3 秒;PDF 上传(仅 .pdf ≤10MB,FileReader 读文本作 manual_content);
 2) App.jsx 导出 makeLiveClaim(companyName):全零模板(score 0/flags []/evidence []/五维全 0),严禁 spread GWD_DATA.CLAIMS[0](FR-37);
 3) src/screens/AnalysisScreen.jsx:导出 normalise(raw, demoClaim) ——行为:raw 空或含 error→null;双命名兼容;flags 补 severity(Data Contradiction|Negative News→high;Vague Claims|Lack of Certification→medium;其余 low);score/flags/evidence 只取 raw;透传 failReason 并派生 contentSource(=== "scraping_snippet_fallback" ? "snippet" : "page");
 4) 轮询:POST /api/analyze {company_name, manual_content};响应含 score 或 status=completed 视为缓存命中直接完成;否则每 3000ms GET /api/report/{job_id},60000ms 死线;AbortController 在卸载/重启时中止;completed→normalise→700ms 后 onComplete;
 5) 仓库根 mock-server.mjs(9 行假后端,内容照 v3-A 册 Phase 2.4)用于自测。
【必须遵守】normalise/makeLiveClaim 必须具名 export;不得在 UI 出现任何未在用的模型名。
【完成判据】
 a) node mock-server.mjs 后浏览器走通 输入→step 文案→报告壳,描述路径并贴 Network 面板里两次轮询的响应 JSON;
 b) grep -n "export function normalise" src/screens/AnalysisScreen.jsx → 有输出;
 c) grep -rn "CLAIMS\[0\]" src/ → 仅允许出现在演示数据自身,不得出现在 makeLiveClaim/normalise;
 d) npm run build → ✓。
【人工检查点】操作员读 normalise 全文并能复述三个分支;之后等 B 喊"契约冻结"再连真后端复测一次。
```

## 卡 A-M2 · 失败与降级三态 UI

```
【角色与边界】同上。
【先读】wiki 03-NFR 的 Scraping Fault Tolerance 表;v2-A 册 Phase 3;AGENTS.md 硬规则 3。
【交付】
 1) AnalysisScreen 导出 getScrapingCopy(failReason, companyName)(not_found 与 blocked 两套可区分文案)与 isScrapingFailure(reason)(仅 ["scraping_not_found","scraping_blocked","scraping_failed"],显式不含 snippet 值);
 2) ManualInputFallback:textarea+提交,提交即携 manual_content 重新发起;若本次已是 manual 再失败→不再弹,落 demo 模板并 toast;
 3) timeout 兜底:60s 到→1.5s 后落模板进报告+toast;
 4) Analysis 屏 meta 区降级 badge:contentSource==="snippet" 时显示 "Source: search snippets · degraded"。
【完成判据】
 a) 改 mock-server 依次返回三种 fail_reason,贴三张行为描述(blocked/not_found→手动输入两套文案;snippet→不弹手动输入且 badge 出现);
 b) npm run build → ✓。
【人工检查点】操作员口述"为什么 snippet 不算失败"(答案见硬规则 3)。
```

## 卡 A-M4 · Report 屏 + Evidence Drawer

```
【角色与边界】同上。
【先读】wiki 10 的 Evidence Object Schema 与 Drawer 显示节;v2-A 册 Phase 4。
【交付】
 1) src/screens/ReportScreen.jsx 五段式:①ScoreDial ②DimensionBars(含 StandardBadge)③FlagCard 列表 ④evidence 按 weight 降序前 5 + "Open full trail" ⑤页脚 "GreenCheck · Greenwashing Detection Engine · AI engine: Gemini / Groq";顶部预留降级横幅位(contentSource==="snippet" 渲染,M5 卡完善文案);
 2) EvidenceDrawer:Hook 全部位于任何 return 之前;选中态用受控 id 派生({forEv,id} 模式,ev prop 跳转优先、用户点选可覆盖),禁止 useEffect 里 setSelected;
 3) App.jsx 接 evidenceOpen state 与 onOpenEvidence(claim, ev)。
【必须遵守】不修改 SharedComponents 既有组件实现(FlagCard 的 onSourceClick 可选 prop 属 M5 卡)。
【完成判据】
 a) npm run lint → 0 errors(react-hooks/rules-of-hooks 必须无违例);
 b) 连真后端查 Shell,描述五段渲染与 Drawer 列表/详情联动;
 c) npm run build → ✓。
【人工检查点】操作员问 agent:"为什么 early return 必须在 Hook 之后?"并核对 Drawer 写法。
```

## 卡 A-M5 · 可解释三 bar + flag→证据跳转 + 降级横幅

```
【角色与边界】同上。
【先读】wiki 10 · Weight Component Schema(权威);v2-A 册 Phase 5;AGENTS.md 硬规则 4。
【交付】
 1) ReportScreen 导出 weightFactors(ev):真分量(0≤number≤1)直读 est:false;缺失回退估算 est:true(reliability 按 kind 启发;recency 必须先 /^\d{4}-\d{2}-\d{2}/ 验 ISO,非 ISO 一律 0.5;relevance 回退 ev.weight ?? 0.5);Drawer 渲染三 bar,est 项加 " · est." 标注;
 2) 导出 findEvidenceForFlag(flag, evidence):小写 token(长度≥3)对 org+title+url 重叠计分,最佳且 ≥2 命中才返回,否则 null;
 3) FlagCard 新增可选 prop onSourceClick(提供时 SOURCE 行渲染为按钮);ReportScreen 接线:命中→onOpenEvidence(claim, match);未命中但有证据→开整体 trail;
 4) 降级横幅正式文案(role="status",措辞按 wiki 03 表)。
【完成判据】
 a) 连真后端查 Shell:三 bar 数值 = 后端首条证据的 reliability/recency/relevance(粘 Network JSON 与 UI 数值对照),无 est.;
 b) 手造缺分量证据(改 mock)→ 三 bar 带 est.;
 c) 点第一个 flag 的 SOURCE → Drawer 定位到 EU ETS 证据(描述);
 d) npm run build → ✓。
【人工检查点】操作员现场问"0.89 怎么来的",对照 wiki 10 公式口算一遍。
```

## 卡 A-M6 · 契约测试 + 三门禁

```
【角色与边界】同上。
【先读】v2-A 册 Phase 6;现有 13 条测试清单(若操作员给了参考路径)。
【交付】
 1) npm i -D vitest;package.json scripts 加 "test": "vitest run";
 2) src/__tests__/contracts.test.jsx 共 13 条:normalise×5(error→null/FR-37 防泄漏/snake_case+severity/snippet 共存/page 默认)、weightFactors×3(直读 est:false/回退 est:true/"Unknown" 与空日期回归=0.5)、findEvidenceForFlag×3(正确解析/单泛词 null/空输入不崩)、失败语义×2(snippet 非失败/两文案区分);
 3) 若缺 eslint.config.js:补 ESLint 10 flat config(rules-of-hooks 保持 error;react-hooks/refs、set-state-in-effect、static-components 降 warn 并注明设计资产豁免理由)。
【完成判据(三连贴真实输出)】
 npm run lint → 0 errors;npm test → "13 passed";npm run build → "✓ built"。
【人工检查点】操作员随机挑 2 条测试,让 agent 解释"这条钉住了哪条硬规则/哪个历史 bug"。
```
