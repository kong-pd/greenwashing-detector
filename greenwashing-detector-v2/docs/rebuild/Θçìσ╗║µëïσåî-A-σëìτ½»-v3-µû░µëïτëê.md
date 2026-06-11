# 重建手册 A v3(新手版)— 前端

> **给谁看**:第一次写 React、第一次做全栈的你。看不懂的词第一次出现时都会用一句话解释。
> **你负责**:`frontend/` 目录。用户在浏览器里看到的一切都是你的作品。
> **节奏**:每个 Phase 按「🎯 这一步做什么 → ⌨️ 敲这个 → 👀 你应该看到 → 🧠 原理一分钟 → ⚠️ 小白陷阱 → ✅ 过关条件」走。过关了再去下一个 Phase,并执行一次第 0 册第 4 节的 Git 六步循环(commit + merge)。
> **参考答案**:每个 Phase 末尾的 📖 标注了参考实现里对应的文件。先自己写,卡 20 分钟再翻。

---

## Phase 0 — 把项目骨架立起来(对应里程碑 M0,约 1 小时)

### 0.1 创建 React 项目

🎯 用脚手架工具 Vite 生成一个最小可跑的 React 工程。

⌨️ 在仓库根目录(`greencheck/`)打开终端:
```bash
# 用官方脚手架创建一个叫 frontend 的 React 项目(react 模板 = 普通 JS,不用 TypeScript)
npm create vite@latest frontend -- --template react
cd frontend
# 安装项目依赖(读 package.json 里的清单,下载到 node_modules 文件夹)
npm install
# 启动开发服务器
npm run dev
```

👀 终端出现 `Local: http://localhost:5173/`。浏览器打开它,看到 Vite + React 的紫色示例页 = 成功。**让这个终端一直开着**,以后改代码浏览器会自动刷新(这叫热更新)。

🧠 原理一分钟:
- **React** 是把界面拆成"组件"的库:一个组件 = 一个返回 HTML 模样代码(叫 **JSX**)的函数。
- **Vite** 是开发服务器 + 打包器:开发时帮你热更新,上线时 `npm run build` 把代码压成静态文件。
- `node_modules/` 是依赖仓库(很大,不提交 Git——脚手架已帮你写进 `.gitignore`);`package.json` 是依赖清单和命令清单。

⚠️ 陷阱:`npm run dev` 的终端被你 Ctrl+C 关了,网页就打不开了。要再开一个终端敲别的命令,用 VS Code 终端右上角的 `+`。

### 0.2 接入设计资产(直接拷,不是作弊)

🎯 把四个"美术资源"文件原样拷进来,你的页面立刻拥有专业视觉。

⌨️ 从参考实现 `frontend/src/` 拷贝以下文件到你的 `frontend/src/`(用文件管理器拖,或 `cp` 命令):
```
index.css                      ← 设计 token:颜色/字体/间距,全站视觉的源头
components/SharedComponents.jsx ← 成品组件库:分数表盘、五维条、Flag卡、徽章…
components/Interactions.jsx     ← 动效(打字机、滚动浮现…)
components/TweaksPanel.jsx      ← 开发用的样式调节面板
data.js                         ← Petrovera 演示数据(后面有大用,也有大坑)
toast.js                        ← 右下角弹提示的小工具
```
然后把 `src/main.jsx` 里的 `import './index.css'` 保留(脚手架自带那行就行,文件已被我们替换)。

👀 `npm run dev` 不报错。页面可能还是示例页,正常——我们还没用上这些组件。

🧠 这四个文件是**受保护设计资产**:团队约定"直接拿、不重写、不顺手优化"。改了它们,三个人的页面观感就不一致了,而且它们用了一些进阶写法,改炸了不好修。

✅ 过关:dev 服务器无报错;`git status` 能看到新文件。
📖 参考:`frontend/src/` 同名文件。

### 0.3 配置代理:让 `/api` 自动转给后端

🎯 前端跑在 5173 端口,B 的后端跑在 8000。浏览器有"同源策略"(不许网页随便请求别的端口),开发期用 Vite 代理解决。

⌨️ 打开 `vite.config.js`,改成:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 凡是以 /api 开头的请求,转发到本机 8000(B 的后端)
      '/api': 'http://localhost:8000',
    },
  },
})
```

🧠 这样你的代码里永远只写 `fetch("/api/analyze")`,本地由 Vite 转发,上线由 Vercel 的 rewrites 转发(部署时再配),**代码一行不用改**。

✅ 过关:保存后 dev 服务器自动重启不报错。

### 0.4 五个屏幕的"路由"空壳

🎯 我们的应用有 5 个屏:landing(首页)/ analysis(分析中)/ report(报告)/ reports(历史)/ watchlist(关注列表)。不用路由库,用一个 state 切换。

⌨️ 把 `src/App.jsx` 整个替换为:
```jsx
import { useState } from "react";
import "./index.css";

// route 是一个对象:name 记录当前在哪个屏,claim/query 携带跨屏数据
export default function App() {
  const [route, setRoute] = useState({ name: "landing" });

  return (
    <div className="app-shell">
      {route.name === "landing"  && <div>这里是 Landing(待 Phase 1)</div>}
      {route.name === "analysis" && <div>这里是 Analysis(待 Phase 2)</div>}
      {route.name === "report"   && <div>这里是 Report(待 Phase 5)</div>}
      {/* 临时导航,方便你点着玩;后面会删 */}
      <div style={{ position: "fixed", bottom: 10, left: 10 }}>
        {["landing", "analysis", "report"].map(n => (
          <button key={n} onClick={() => setRoute({ name: n })}>{n}</button>
        ))}
      </div>
    </div>
  );
}
```

👀 页面出现三个按钮,点击在三句话之间切换。

🧠 原理一分钟:`useState` 是 React 的"记忆"——`route` 是当前值,`setRoute` 是更新它的唯一方法;一更新,React 自动重画界面。`{条件 && <组件/>}` 是 JSX 的"条件渲染"。**这就是整个 App 的导航原理,没有更多魔法了。**

✅ **M0 过关**:三个屏能切。截图发群(暗号:"5173 能开,屏能切")。Git 六步循环走一遍。
📖 参考:`frontend/src/App.jsx`(它有 1000 行,因为还包含历史/watchlist 屏,先别被吓到,我们一块块长出来)。

---

## Phase 1 — Landing:输入与分流(约 2 小时)

### 1.1 输入框 + 五个预载公司

🎯 一个大输入框、一个 Analyze 按钮、五个快捷 chip(Shell / H&M / Patagonia / Tesla / BP——这五家 C 做了离线缓存,**断网也能出完整报告**,是你们演示的保命符)。

⌨️ 新建 `src/screens/` 文件夹和 `src/screens/LandingScreen.jsx`:
```jsx
import { useState } from "react";

const DEMO_COMPANIES = ["Shell", "H&M", "Patagonia", "Tesla", "BP"];

// props:父组件(App)传进来的参数。onAnalyze 是"开始分析"的回调函数
export function LandingScreen({ onAnalyze }) {
  const [value, setValue] = useState("");
  const [hint, setHint]   = useState("");

  function submit(name) {
    const trimmed = (name ?? value).trim();
    if (!trimmed) {                      // 空输入:提示并 3 秒后消失
      setHint("Enter a company name to analyse");
      setTimeout(() => setHint(""), 3000);
      return;
    }
    onAnalyze(trimmed);                  // 交给 App 切屏
  }

  return (
    <div className="landing">
      <h1>GreenCheck</h1>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}        // 受控输入:值存在 state 里
        onKeyDown={e => e.key === "Enter" && submit()}  // 回车也能提交
        placeholder="Company name…"
      />
      <button onClick={() => submit()}>Analyze</button>
      {hint && <div className="hint">{hint}</div>}
      <div className="chips">
        {DEMO_COMPANIES.map(c => (
          <button key={c} onClick={() => submit(c)}>{c}</button>
        ))}
      </div>
    </div>
  );
}
```
回到 `App.jsx`:顶部 `import { LandingScreen } from "./screens/LandingScreen.jsx";`,把 landing 那行换成:
```jsx
{route.name === "landing" && (
  <LandingScreen onAnalyze={(name) => setRoute({ name: "analysis", query: name })} />
)}
```

👀 输入名字回车 → 跳到 "这里是 Analysis";空输入 → 出提示,3 秒消失;点 Shell chip 同样跳转。

### 1.2 makeLiveClaim:防"夹具泄漏"的安全模板(必须一字不差)

🎯 跨屏传的数据叫 **claim**(一次分析的全部信息)。给真实公司造初始 claim 时,有个全项目级红线:

🧠 `data.js` 里有一家虚构公司 Petrovera 的完整演示数据。**历史事故**:有人图省事 `{...GWD_DATA.CLAIMS[0], headline: 公司名}` ——结果 Petrovera 的旗子、证据混进了真实公司的报告。这就是需求 FR-37 的来历:**真实公司的初始 claim 必须是全零模板,绝不 spread 演示数据**。

⌨️ 在 `App.jsx` 里加(并 `export`,以后测试要用):
```jsx
// FR-37:为真实公司构造"全零"初始 claim。score 0、空 flags、空 evidence、五维全 0。
// 绝对不要 {...GWD_DATA.CLAIMS[0]} —— 那会把 Petrovera 的演示数据泄漏进真实报告。
export function makeLiveClaim(companyName) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "LIVE", headline: companyName, company_name: companyName,
    shortQuote: "", source: "GreenCheck live analysis", sourceType: "AI Analysis",
    capturedAt: today, analyzedAt: today,
    score: 0, riskLevel: "—", risk_level: "—", summary: "", confidence: 0.85,
    flags: [], evidence: [],
    dimensionScores: { specificity: 0, data_consistency: 0,
      third_party_certification: 0, negative_news: 0, greenwashing_language: 0 },
  };
}
```

✅ 过关:输入分流可用;`makeLiveClaim` 已 export。commit + merge。
📖 参考:`frontend/src/App.jsx` 的 `makeLiveClaim` 与 Landing 段。

---

## Phase 2 — Analysis 屏:轮询状态机(M1 的心脏,约半天,慢慢来)

> 这是全前端**最重要**的一段。写完它,你就理解了"前后端异步协作"这件事的全部。

### 2.1 先理解时序(画在纸上)

```
你 POST /api/analyze {company_name:"Acme"}
B 立刻回:{ job_id:"ab12", status:"processing" }      ← 不等结果,先给单号
你每 3 秒 GET /api/report/ab12
   …… { status:"processing", step:"Scraping…" }       ← 还没好,显示进度文案
   …… { status:"processing", step:"Analysing…" }
   …… { status:"completed", score:61, flags:[…] }     ← 好了!整理后切去 Report
超过 60 秒还没好 → 走兜底(Phase 4)
```

### 2.2 normalise:你最重要的纯函数(完整抄写并理解每一行)

🎯 后端的 JSON 和前端想要的形状有差异(命名风格、缺字段…)。`normalise` 把"任何后端响应"整理成"前端铁定能渲染的 claim"。**这是 A 和 B 之间的翻译官,必须 export(测试要 import 它)。**

⌨️ 新建 `src/screens/AnalysisScreen.jsx`,先写这个函数:
```jsx
// 把后端轮询响应整理成前端 claim。raw 为空/带 error → 返回 null(表示"继续轮询")。
export function normalise(raw, demoClaim) {
  if (!raw || raw.error) return null;

  // 后端字段是 snake_case(risk_level),有些历史接口是 camelCase——两种都认
  const risk = raw.riskLevel || raw.risk_level || "—";
  const dims = raw.dimensionScores || raw.dimension_scores || {};

  // 每条 flag 保证有 severity;后端漏了就按类型推断(和后端用同一套规则)
  const flags = (raw.flags || []).map(f => ({
    ...f,
    severity: f.severity || (
      ["Data Contradiction", "Negative News"].includes(f.type) ? "high" :
      ["Vague Claims", "Lack of Certification"].includes(f.type) ? "medium" : "low"
    ),
  }));

  return {
    ...demoClaim,                       // 只继承"骨架"(makeLiveClaim 的全零模板)
    score: raw.score ?? 0,
    riskLevel: risk, risk_level: risk,
    summary: raw.summary ?? "",
    dimensionScores: {
      specificity: dims.specificity ?? 0,
      data_consistency: dims.data_consistency ?? 0,
      third_party_certification: dims.third_party_certification ?? 0,
      negative_news: dims.negative_news ?? 0,
      greenwashing_language: dims.greenwashing_language ?? 0,
    },
    // FR-37:flags/evidence 只来自后端;后端没给就是空数组,绝不从演示数据补
    flags,
    evidence: raw.evidence || [],

    // 降级标记:completed 的任务也可能带 fail_reason = "scraping_snippet_fallback",
    // 意思是"整页抓不到,这份报告基于搜索摘要"。透传给报告页显示诚实横幅。
    failReason: raw.fail_reason ?? raw.failReason ?? null,
    contentSource: (raw.fail_reason ?? raw.failReason) === "scraping_snippet_fallback"
      ? "snippet" : "page",
  };
}
```

🧠 三个关键决定都写在注释里了:错误→null 让轮询继续;严防夹具泄漏;**先看 status 再看 fail_reason**(降级≠失败)。

### 2.3 轮询 effect(完整抄写)

⌨️ 同文件,组件主体:
```jsx
import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 3000;
const API_TIMEOUT_MS   = 60000;

export function AnalysisScreen({ query, manualContent, onComplete, onFail }) {
  const [step, setStep] = useState("Submitting…");
  const claimRef = useRef(null);          // 存 makeLiveClaim 的模板,跨轮询不变

  useEffect(() => {
    const ctrl = new AbortController();   // 用来在"离开屏幕"时掐断进行中的请求
    let pollTimer, deadlineTimer, alive = true;

    async function start() {
      try {
        // 第一步:提交分析
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: query, manual_content: manualContent ?? null }),
          signal: ctrl.signal,
        });
        const data = await res.json();

        // 缓存命中:B 直接把完整报告塞回来了(有 score 就是)
        if (data.status === "completed" || typeof data.score === "number") {
          return finish(data);
        }
        if (!data.job_id) return onFail?.(data.fail_reason ?? "unknown", data);
        poll(data.job_id);                               // 第二步:开始轮询
        deadlineTimer = setTimeout(() => {               // 60 秒死线
          alive = false; ctrl.abort();
          onFail?.("timeout", null);
        }, API_TIMEOUT_MS);
      } catch (e) {
        if (e.name !== "AbortError") onFail?.("network", null);
      }
    }

    function poll(jobId) {
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`/api/report/${jobId}`, { signal: ctrl.signal });
          const data = await res.json();
          if (!alive) return;
          if (data.status === "completed") { clearInterval(pollTimer); finish(data); }
          else if (data.status === "failed") {
            clearInterval(pollTimer); onFail?.(data.fail_reason, data);
          } else if (data.step) setStep(data.step);      // 显示后端进度文案
        } catch (e) { /* 单次轮询失败不致命,下一轮再试 */ }
      }, POLL_INTERVAL_MS);
    }

    function finish(data) {
      clearTimeout(deadlineTimer);
      const merged = normalise(data, claimRef.current);
      if (merged) setTimeout(() => onComplete?.(merged), 700);  // 留 0.7s 给动画收尾
    }

    start();
    // 清理函数:离开这个屏幕时执行——掐请求、清定时器。没有它,切屏后旧请求
    // 还会回来 setState,你会看到"幽灵报告"和控制台警告。
    return () => { alive = false; ctrl.abort(); clearInterval(pollTimer); clearTimeout(deadlineTimer); };
  }, [query]);   // query 变了(用户重新发起)就整个重来

  return <div className="analysis"><div className="step">{step}</div></div>;
}
```
`App.jsx` 接线:analysis 屏渲染 `<AnalysisScreen query={route.query} onComplete={(claim)=>setRoute({name:"report", claim})} onFail={(reason,data)=>…Phase 4 再写} />`;记得在进入 analysis 前 `claimRef` 的模板由 `makeLiveClaim(route.query)` 提供(最简单:把模板作为 prop 传进去存进 ref,参考实现就是这么做的)。

### 2.4 用"假后端"先跑通(不等 B!)

🎯 B 的接口可能还没好,你用一个 9 行的假服务器顶上,**这就是契约先行的好处**。

⌨️ 仓库根新建 `mock-server.mjs`:
```js
// 极简假后端:固定返回一份 completed 报告(形状照 wiki 05 的示例抄)
import http from "node:http";
const report = { status: "completed", score: 61, risk_level: "High Risk",
  summary: "Mock summary.", dimension_scores: { specificity: 12, data_consistency: 13,
  third_party_certification: 11, negative_news: 14, greenwashing_language: 11 },
  flags: [{ type: "Vague Claims", description: "mock", source: "mock" }],
  evidence: [] };
http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/analyze") return res.end(JSON.stringify({ job_id: "m1", status: "processing" }));
  res.end(JSON.stringify(report));
}).listen(8000, () => console.log("mock backend on :8000"));
```
新终端:`node mock-server.mjs`。回到网页,输入任意名字。

👀 看到 step 文案 → 3 秒后切到 "这里是 Report"。

✅ **M1(你这侧)过关**。〔联调〕等 B 在群里喊"双态可用,契约冻结"后,关掉 mock-server,连真后端再跑一遍,全队围观"假 Shell 全程跑通"。commit + merge。
📖 参考:`frontend/src/screens/AnalysisScreen.jsx`(normalise 在 41 行起;它还多一套管线动画,属于加分项,M4 后有余力再抄)。

---

## Phase 3 — 失败与降级:产品的"诚实"门面(M2,约 3 小时)

🎯 三种情况三种 UI:**找不到页面** / **页面进不去** → 让用户手动粘贴内容;**页面进不去但搜索摘要够用** → 报告照出,但挂"降级"横幅。

⌨️ `AnalysisScreen.jsx` 加两个 export 的小函数(测试要用):
```jsx
// 两种"硬失败"的文案必须可区分——用户需要知道该怪谁、该干嘛
export function getScrapingCopy(failReason, companyName) {
  if (failReason === "scraping_not_found") return {
    title: "ESG page not found",
    body: `We couldn't find an ESG page for ${companyName}. Paste the content below, or give us a URL.`,
  };
  return {
    title: "Access blocked",
    body: `We found ${companyName}'s page but couldn't access it. Paste the content below to continue.`,
  };
}

// 哪些 fail_reason 触发"手动输入 UI"。注意:snippet 降级【不在】名单里——
// 它是降级成功,不是失败;把它放进来会顶掉用户已经拿到的报告(真实教训)。
export function isScrapingFailure(reason) {
  return ["scraping_not_found", "scraping_blocked", "scraping_failed"].includes(reason);
}
```
然后:
1. `onFail` 分支:`isScrapingFailure(reason)` 为真 → 渲染 **ManualInputFallback**(一个 textarea + 提交按钮,提交时带 `manual_content` 重新走 Phase 2 的流程);`timeout` → 1.5 秒后用演示模板进报告并 toast 说明;其余 → 错误卡片 + 重试按钮。
2. 降级 badge:在 analysis 屏的 meta 区加一行,`contentSource === "snippet"` 时显示 `Source: search snippets · degraded`(暖色)。
3. **防循环**:如果这次本来就是手动内容(`manualContent` 非空)还失败,不再弹手动输入,直接落模板。

👀 自测方法:改 mock-server,把 `/api/report` 返回换成 `{status:"failed", fail_reason:"scraping_blocked"}` 看手动输入;换成 `scraping_not_found` 看另一套文案;换成 `{...report, fail_reason:"scraping_snippet_fallback"}` 确认**不**弹手动输入。

✅ M2 过关:三态各有像样的 UI。commit + merge。
📖 参考:`AnalysisScreen.jsx` 的 `SCRAPING_FAIL_COPY / ManualInputFallback` 段。

---

## Phase 4 — Report 屏:把数据画成报告(M4,约 1 天)

🎯 五段式:①分数表盘+风险等级 ②五维条(每条挂标准徽章) ③Flag 卡 ④证据列表 ⑤方法论说明。**好消息:①②③的视觉组件都在 `SharedComponents.jsx` 里是现成的**,你做的是排版和接数据。

⌨️ 新建 `src/screens/ReportScreen.jsx` 骨架:
```jsx
import { ScoreDial, DimensionBars, FlagCard, StandardBadge } from "../components/SharedComponents.jsx";

export function ReportScreen({ claim, onBack, onOpenEvidence }) {
  return (
    <div className="report">
      <button onClick={onBack}>← back</button>

      {/* 降级横幅:Phase 3 透传的 contentSource 在这里兑现 */}
      {claim.contentSource === "snippet" && (
        <div className="degraded-banner" role="status">
          <b>DEGRADED SOURCE</b> — {claim.headline}'s full ESG page could not be accessed;
          this analysis is based on search-result snippets.
        </div>
      )}

      {/* §1 分数 */}
      <ScoreDial score={claim.score} riskLevel={claim.riskLevel} />
      <p>{claim.summary}</p>

      {/* §2 五维(组件内部已带 StandardBadge:TCFD/GRI…) */}
      <DimensionBars scores={claim.dimensionScores} />

      {/* §3 flags(Phase 6 会给 FlagCard 加点击跳转) */}
      {(claim.flags ?? []).map((f, i) => <FlagCard key={i} flag={f} idx={i} />)}

      {/* §4 证据:按 weight 降序取前 5 */}
      {[...(claim.evidence ?? [])].sort((a, b) => b.weight - a.weight).slice(0, 5)
        .map(ev => (
          <div key={ev.id} className="ev-row" onClick={() => onOpenEvidence?.(claim, ev)}>
            <span>{ev.id}</span> <b>{ev.kind}</b> {ev.title} — {ev.org} · {ev.date}
            <em>"{ev.quote}"</em> <span>{ev.weight}</span>
          </div>
        ))}
      <button onClick={() => onOpenEvidence?.(claim)}>Open full trail →</button>

      {/* §5 页脚(正式品牌,别写任何赛事字样) */}
      <footer>GreenCheck · Greenwashing Detection Engine · AI engine: Gemini / Groq</footer>
    </div>
  );
}
```

**EvidenceDrawer(抽屉:左列表右详情)** —— 有一个真实的历史 bug 要绕开,照这个写:
```jsx
import { useState } from "react";

export function EvidenceDrawer({ claim, ev, onClose }) {
  // ⚠️ 规则:Hook(useState 等)必须在任何 return 之前无条件执行。
  // 历史 bug:有人把 if (!claim) return null 写在 useState 前面,
  // React 直接崩("Rendered fewer hooks than expected")。
  const evidence = claim?.evidence ?? [];
  const [picked, setPicked] = useState(null);   // {forEv, id}:记录"用户在当前跳转目标下点了谁"
  const localId = picked && picked.forEv === (ev?.id ?? null) ? picked.id : null;
  const selected = (localId && evidence.find(e => e.id === localId)) || ev || evidence[0];

  if (!claim || !selected) return null;         // early return 放在 Hook 之后,安全

  return (
    <div className="drawer">
      <div className="scrim" onClick={onClose} />
      <aside>
        {evidence.map(e => (
          <div key={e.id}
               className={e.id === selected.id ? "active" : ""}
               onClick={() => setPicked({ forEv: ev?.id ?? null, id: e.id })}>
            {e.id} · {e.kind} · {e.weight}
          </div>
        ))}
      </aside>
      <main>
        <h3>{selected.title}</h3>
        <p>{selected.org} · {selected.date}</p>
        <blockquote>{selected.quote}</blockquote>
        {/* 三条权重分解 bar:Phase 5 实装 */}
      </main>
    </div>
  );
}
```
`App.jsx`:加 `const [evidenceOpen, setEvidenceOpen] = useState(null);`,report 屏传 `onOpenEvidence={(claim, ev)=>setEvidenceOpen({claim, ev})}`,最外层渲染 `{evidenceOpen && <EvidenceDrawer {...evidenceOpen} onClose={()=>setEvidenceOpen(null)} />}`。

✅ M4 过关:连真后端查 "Shell",五段齐全、抽屉能开能选。把截图发群挑刺。
📖 参考:`frontend/src/screens/ReportScreen.jsx`(完整版含打印 PDF、引用复制等加分项)。

---

## Phase 5 — 可解释与可审计(M5,约半天;这是产品的灵魂)

### 5.1 weightFactors:三条权重 bar 读真数据(完整抄写)

🧠 C 在每条证据上算好了三个分量:`reliability`(来源可靠度)/`recency`(新鲜度)/`relevance`(相关度)。**有真值用真值;老数据缺字段才估算,且必须标 "est."**——诚实标注是产品原则。还有个历史 bug 要绕:日期字段可能是 `"Unknown"`,而字符串比较里 `"U" > "2"`,会把未知日期当成最新!

⌨️ `ReportScreen.jsx` 顶部加(必须 export):
```jsx
export function weightFactors(ev) {
  const hasISO = typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(ev.date);
  const real = v => typeof v === "number" && v >= 0 && v <= 1;

  // 缺字段时的估算(仅 legacy 数据会走到):
  const estReliability =
    ev.kind === "Filing" || ev.kind === "Database" ? 0.92 :
    ev.kind === "Document" ? 0.78 : ev.kind === "News" ? 0.65 :
    ev.kind === "Linguistic" ? 0.55 : 0.7;
  const estRecency = !hasISO ? 0.5                       // ← 防 "Unknown" 当最新
    : ev.date >= "2026-01-01" ? 0.95
    : ev.date >= "2025-01-01" ? 0.78 : 0.55;

  return [
    { lbl: "Source reliability", v: real(ev.reliability) ? ev.reliability : estReliability, est: !real(ev.reliability) },
    { lbl: "Recency",            v: real(ev.recency)     ? ev.recency     : estRecency,     est: !real(ev.recency) },
    { lbl: "Relevance",          v: real(ev.relevance)   ? ev.relevance   : (ev.weight ?? 0.5), est: !real(ev.relevance) },
  ];
}
```
在 Drawer 的 `<main>` 里渲染:
```jsx
{weightFactors(selected).map(f => (
  <div key={f.lbl} className="bar-row">
    <span>{f.lbl}{f.est && <small> · est.</small>}</span>
    <div className="rail"><div className="fill" style={{ width: f.v * 100 + "%" }} /></div>
    <span>{Math.round(f.v * 100)}</span>
  </div>
))}
```

### 5.2 findEvidenceForFlag:点 flag 的来源,跳到对应证据(完整抄写)

🧠 flag 的 `source` 是自由文本("EU ETS Union Registry 2024; …"),证据是结构化对象。做模糊匹配:拆词、数命中、**至少命中 2 个词**才跳(只命中一个 "report" 这种泛词就跳,跳错比不跳更伤信任)。

⌨️ `ReportScreen.jsx`(export):
```jsx
export function findEvidenceForFlag(flag, evidence) {
  const list = Array.isArray(evidence) ? evidence : [];
  const src = String(flag?.source || "").toLowerCase();
  if (!src || !list.length) return null;
  const tokens = src.split(/[^a-z0-9]+/).filter(t => t.length >= 3);
  if (!tokens.length) return null;
  let best = null, bestScore = 0;
  for (const ev of list) {
    const hay = `${ev.org || ""} ${ev.title || ""} ${ev.url || ""}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (score > bestScore) { bestScore = score; best = ev; }
  }
  return bestScore >= 2 ? best : null;   // 至少两词命中才算找到
}
```
接线:给 `FlagCard` 传 `onSourceClick`(SharedComponents 里的 FlagCard 已支持这个可选 prop:传了它,SOURCE 行就变成可点的按钮):
```jsx
{(claim.flags ?? []).map((f, i) => (
  <FlagCard key={i} flag={f} idx={i}
    onSourceClick={() => {
      const m = findEvidenceForFlag(f, claim.evidence);
      if (m) onOpenEvidence?.(claim, m);
      else if ((claim.evidence ?? []).length) onOpenEvidence?.(claim);  // 没匹配上就开整体
    }} />
))}
```

✅ M5 过关:查 Shell → 抽屉三条 bar 显示真值且**无** est.;自己手造一条缺字段证据 → 显示 est.;点第一个 flag 的 SOURCE → 抽屉直接定位到 EU ETS 那条。全队互问"0.87 怎么来的",你现场点给他们看。
📖 参考:`ReportScreen.jsx` 顶部两个函数 + §3 接线处。

---

## Phase 6 — 测试与三道门禁(M6,约 3 小时)

### 6.1 装测试框架并写契约测试

🧠 **单元测试**就是"用代码检查代码":给函数喂输入,断言输出。我们只测那 5 个 export 的纯函数——它们是 A 的"公共承诺"。

⌨️
```bash
npm i -D vitest        # -D = 开发依赖,只在开发期用
```
`package.json` 的 `"scripts"` 里加一行:`"test": "vitest run"`。
新建 `src/__tests__/contracts.test.jsx`,照下面的样子写 13 条(`describe` 分组,`it` 是一条用例,`expect(...).toBe(...)` 是断言):
```jsx
import { describe, it, expect } from "vitest";
import { normalise, getScrapingCopy, isScrapingFailure } from "../screens/AnalysisScreen.jsx";
import { weightFactors, findEvidenceForFlag } from "../screens/ReportScreen.jsx";
import { makeLiveClaim } from "../App.jsx";

const demo = makeLiveClaim("Acme");

describe("normalise", () => {
  it("error 信封返回 null(轮询继续)", () => {
    expect(normalise({ error: "Job not found" }, demo)).toBeNull();
  });
  it("FR-37:绝不泄漏演示 flags/evidence", () => {
    const seeded = { ...demo, flags: [{ type: "Leak" }], evidence: [{ id: "E-99" }] };
    const out = normalise({ status: "completed", score: 10 }, seeded);
    expect(out.flags).toEqual([]); expect(out.evidence).toEqual([]);
  });
  it("completed + snippet 标记共存 → contentSource=snippet", () => {
    const out = normalise({ status: "completed", score: 40,
      fail_reason: "scraping_snippet_fallback" }, demo);
    expect(out.contentSource).toBe("snippet");
  });
  // …再补:snake_case 映射、severity 推断、默认 page,共 5-6 条
});

describe("weightFactors", () => {
  it("有真分量就直读,est 全 false", () => {
    const f = weightFactors({ kind: "News", date: "2026-05-01",
      weight: .8, reliability: .85, recency: .95, relevance: .8 });
    expect(f.map(x => x.v)).toEqual([0.85, 0.95, 0.8]);
    expect(f.every(x => x.est === false)).toBe(true);
  });
  it('回归:"Unknown" 日期绝不当成最新', () => {
    expect(weightFactors({ kind: "News", date: "Unknown", weight: .5 })[1].v).toBe(0.5);
  });
});

describe("findEvidenceForFlag", () => {
  const evidence = [{ id: "E-01", org: "EU ETS Union Registry", title: "Verified emissions", url: "" }];
  it("自由文本能解析到正确证据", () => {
    expect(findEvidenceForFlag({ source: "EU ETS Union Registry 2024" }, evidence)?.id).toBe("E-01");
  });
  it("单个泛词不跳(防误导)", () => {
    expect(findEvidenceForFlag({ source: "Registry" }, evidence)).toBeNull();
  });
});

describe("失败语义", () => {
  it("snippet 不是失败,不触发手动输入", () => {
    expect(isScrapingFailure("scraping_snippet_fallback")).toBe(false);
    expect(isScrapingFailure("scraping_blocked")).toBe(true);
  });
  it("两种硬失败文案可区分", () => {
    expect(getScrapingCopy("scraping_not_found", "X").title)
      .not.toBe(getScrapingCopy("scraping_blocked", "X").title);
  });
});
```

⌨️ 跑:`npm test` 👀 `13 passed`(红了就读它指出的那一行,这正是测试的价值)。

### 6.2 Lint(代码体检)

⌨️ 项目根有没有 `eslint.config.js`?没有就从参考实现拷一份(ESLint 10 没它会报"找不到配置")。然后:
```bash
npm run lint
```
👀 `0 errors`(warnings 可以有,大多来自设计资产,已约定降级,**不要去改那四个文件**)。

### 6.3 构建

```bash
npm run build
```
👀 `✓ built`,产物在 `dist/`(上线就是把这个文件夹交给 Vercel)。

✅ **M6 过关 = 三连绿**:`npm run lint && npm test && npm run build`。截图发群。
📖 参考:`frontend/src/__tests__/contracts.test.jsx`(完整 13 条)、`frontend/eslint.config.js`。

---

## 常见症状速查(贴在显示器边)

| 症状 | 多半是 | 去哪修 |
|------|--------|--------|
| 页面白屏,Console 红字 `Rendered fewer hooks` | Hook 写在了 early return 后面 | Phase 4 Drawer 的写法 |
| 真实公司报告里出现 Petrovera 的旗子 | spread 了演示数据 | Phase 1.2,FR-37 |
| 切屏后控制台警告 setState on unmounted | 轮询没清理 | Phase 2.3 的 return 清理函数 |
| 未知日期的证据 Recency 显示 95 | 字典序比较坑 | Phase 5.1 的 hasISO 守卫 |
| snippet 报告弹出"请粘贴内容" | isScrapingFailure 名单写错 | Phase 3,跑 `npm test` 那条会红 |
| `/api` 404 | 后端没起 / 代理没配 | Phase 0.3;问 B 服务起了没 |

## 写给你的最后一段话

这一册看着长,其实你真正"发明"的逻辑只有五个纯函数 + 一个轮询 effect,其余都是排版和接线。把那五个函数当成你对队友的**承诺**:B 知道 normalise 会兜住他的任何形状,C 知道他算的分量会被原样画出来——这就是协作的全部秘密:**把承诺写成函数,把函数钉上测试**。
