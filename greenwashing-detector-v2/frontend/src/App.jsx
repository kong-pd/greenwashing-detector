// App.jsx — main shell: top bar, left watchlist, main canvas, evidence drawer.
// Drives the route between Landing → Company portfolio → Analysis → Report.
//
// Patches applied vs original:
//   US-03: Landing hints → real demo companies (Shell, H&M, Patagonia, Tesla, BP)
//   US-04: Real-company searches pass templateClaim so AnalysisScreen shows correct name
//   US-05: WatchlistScreen handleAnalyse also uses templateClaim

import React, { useState, useEffect, useMemo } from "react";
import { GWD_DATA } from "./data.js";
import { gwdToast } from "./toast.js";
import { riskBand, bandColor, DimensionBars, RiskPill, DIMENSION_META } from "./components/SharedComponents.jsx";
import {
  useTweaks, TweaksPanel,
  TweakSection, TweakColor, TweakRadio, TweakSelect, TweakToggle,
} from "./components/TweaksPanel.jsx";
import {
  Toaster, useDropdown,
  NotificationsMenu, UserMenu, CommandPalette, SettingsSheet,
} from "./components/Interactions.jsx";
import { AnalysisScreen } from "./screens/AnalysisScreen.jsx";
import { ReportScreen, EvidenceDrawer } from "./screens/ReportScreen.jsx";

const TWEAK_DEFAULTS = {
  palette: "sage",
  scoreVariant: "arc",
  density: "regular",
  displayFamily: "serif",
  showTickerStrip: true,
};

const PALETTES = {
  sage: {
    "--c-bg":       "#FAFAF8",
    "--c-bg-2":    "#F4F4EF",
    "--c-surface": "#FFFFFF",
    "--c-line":    "#E6E5DD",
    "--c-line-2":  "#D9D8CE",
    "--c-ink-0":   "#0F1A14",
    "--c-ink-1":   "#3A3F37",
    "--c-ink-2":   "#6B7280",
    "--c-ink-3":   "#9AA0A1",
    "--c-accent":  "#3F5E48",
    "--c-accent-2":"#1F2D24",
    "--c-ok":      "#4F7A4D",
    "--c-warn":    "#B0741A",
    "--c-bad":     "#A64236",
  },
  slate: {
    "--c-bg":       "#F7F8FA",
    "--c-bg-2":    "#EEF0F3",
    "--c-surface": "#FFFFFF",
    "--c-line":    "#E2E5EA",
    "--c-line-2":  "#CFD3DA",
    "--c-ink-0":   "#0F1720",
    "--c-ink-1":   "#37424E",
    "--c-ink-2":   "#6B7280",
    "--c-ink-3":   "#98A1AB",
    "--c-accent":  "#3D7A8A",
    "--c-accent-2":"#1F4E5F",
    "--c-ok":      "#3F7A6B",
    "--c-warn":    "#B57516",
    "--c-bad":     "#A8463A",
  },
  forest: {
    "--c-bg":       "#F8F8F5",
    "--c-bg-2":    "#EFEFE8",
    "--c-surface": "#FFFFFF",
    "--c-line":    "#E0E0D6",
    "--c-line-2":  "#CDCEC2",
    "--c-ink-0":   "#10130E",
    "--c-ink-1":   "#2D332B",
    "--c-ink-2":   "#67706B",
    "--c-ink-3":   "#959C95",
    "--c-accent":  "#2D6A4F",
    "--c-accent-2":"#1B4332",
    "--c-ok":      "#3D7A4F",
    "--c-warn":    "#A87016",
    "--c-bad":     "#A23F33",
  },
};

function applyPalette(name) {
  const root = document.documentElement;
  const p = PALETTES[name] || PALETTES.sage;
  Object.entries(p).forEach(([k, v]) => root.style.setProperty(k, v));
}

// ── US-03: Demo companies pre-cached in local_cache.json ─────────────────────
// These get real data from the backend; any input is acceptable too.
const DEMO_COMPANIES = ["shell", "h&m", "patagonia", "tesla", "bp"];

// Build a minimal "live analysis" claim template for external company searches.
// AnalysisScreen fetches real data and overwrites every field.
// FR-37: Do NOT spread GWD_DATA.CLAIMS[0] — that would leak Petrovera demo data
//        into real company reports when the API returns incomplete results.
function makeLiveClaim(companyName) {
  return {
    id:             "LIVE",
    headline:       companyName,
    shortQuote:     `Analysing ${companyName}'s sustainability claims…`,
    source:         "GreenCheck live analysis",
    sourceType:     "AI Analysis",
    capturedAt:     new Date().toISOString().slice(0, 10),
    analyzedAt:     new Date().toISOString().slice(0, 10),
    company_name:   companyName,
    score:          0,
    riskLevel:      "—",
    risk_level:     "—",
    summary:        "",
    confidence:     0.85,
    flags:          [],
    evidence:       [],
    dimensionScores: {
      specificity:               0,
      data_consistency:          0,
      third_party_certification: 0,
      negative_news:             0,
      greenwashing_language:     0,
    },
  };
}

// Tab configs — US-03: hints are the five pre-cached real companies
const TABS = [
  {
    id: "company",
    label: "Company",
    placeholder: "Company name, ticker, or ISIN — e.g. Shell, Tesla, H&M…",
    hints: ["Shell", "H&M", "Patagonia", "Tesla", "BP"],
  },
  {
    id: "claim",
    label: "Claim",
    placeholder: 'Paste a sustainability claim verbatim — e.g. "Net-zero by 2050"…',
    hints: ["We will be net-zero by 2050", '"100% sustainable cotton"'],
  },
  {
    id: "upload",
    label: "Report PDF",
    placeholder: "Drop a file or paste a URL to an annual report…",
    hints: [],
  },
];

function LandingScreen({ onCompany, onAnalyze }) {
  const [activeTab, setActiveTab]     = useState("company");
  const [inputValue, setInputValue]   = useState("");
  const [validationMsg, setValidationMsg] = useState("");
  const [uploadFile,   setUploadFile]  = useState(null);   // FR-02: uploaded PDF file
  const [uploading,    setUploading]   = useState(false);  // FR-02: reading state
  const inputRef = React.useRef(null);
  const tab = TABS.find(t => t.id === activeTab);

  useEffect(() => { inputRef.current?.focus(); }, [activeTab]);
  useEffect(() => {
    if (validationMsg) {
      const t = setTimeout(() => setValidationMsg(""), 3000);
      return () => clearTimeout(t);
    }
  }, [validationMsg]);

  // FR-02: handle PDF file selection → read as text → trigger analysis
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setValidationMsg("File too large — maximum 10 MB");
      return;
    }
    setUploadFile(file);
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploading(false);
      const content = ev.target.result;
      const companyName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      const claim = makeLiveClaim(companyName);
      // Pass extracted text as manual_content so backend skips scraping
      onAnalyze({ ...claim, _manualContent: content }, companyName);
    };
    reader.onerror = () => {
      setUploading(false);
      setValidationMsg("Could not read the file — try pasting the content instead");
    };
    reader.readAsText(file);
  }

  // US-01: search triggers analysis pipeline
  function handleAnalyze() {
    const val = inputValue.trim();
    if (!val) {
      setValidationMsg("Enter a company name, ticker, or paste a claim to continue");
      inputRef.current?.focus();
      return;
    }

    const lower = val.toLowerCase();
    const claims = GWD_DATA.CLAIMS;

    // US-03 / US-05: Real cached companies → use templateClaim so AnalysisScreen
    // shows the correct company name and the backend returns real data.
    const isRealCompany = DEMO_COMPANIES.some(d => lower.includes(d) || d.includes(lower));
    if (isRealCompany) {
      onAnalyze(makeLiveClaim(val), val);
      return;
    }

    // For claims pasted in the Claim tab or other input:
    // try to match by content first, then fall back to deterministic hash
    const byContent = claims.find(cl =>
      cl.headline.toLowerCase().includes(lower) ||
      cl.shortQuote.toLowerCase().includes(lower)
    );
    const byHash = claims[
      val.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % claims.length
    ];
    onAnalyze(byContent ?? byHash, val);
  }

  return (
    <div className="lv2-page">
      <div className="lv2-hero">
        <div className="lv2-center">

          <p className="lv2-eyebrow mono">ESG FACT-CHECKING ENGINE</p>

          <h1 className="lv2-title">
            Greenwashing<br />Detector
          </h1>

          <div className="lv2-search-block">
            <div className="lv2-tabs" role="tablist">
              {TABS.map(t => (
                <button key={t.id} role="tab" aria-selected={activeTab === t.id}
                  className={"lv2-tab" + (activeTab === t.id ? " on" : "")}
                  onClick={() => { setActiveTab(t.id); setInputValue(""); setValidationMsg(""); setUploadFile(null); }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="lv2-input-row">
              {activeTab === "upload" ? (
                <label className="lv2-upload-zone" style={{ cursor: uploading ? "wait" : "pointer" }}>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                    <path d="M10 13V5M7 8l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 15h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {uploading ? (
                    <span>Reading PDF<span className="dots"><span/><span/><span/></span></span>
                  ) : uploadFile ? (
                    <span>
                      {uploadFile.name}
                      <button style={{ marginLeft: 10, color: "rgba(255,255,255,.5)", fontSize: 11 }}
                        onClick={e => { e.preventDefault(); setUploadFile(null); }}>✕</button>
                    </span>
                  ) : (
                    <span>Drop a PDF or <span className="lv2-upload-link">browse files</span> — max 10 MB</span>
                  )}
                  <input type="file" accept=".pdf" style={{ display: "none" }}
                    onChange={handleFileChange} />
                </label>
              ) : (
                <>
                  <div className={"lv2-input-box" + (validationMsg ? " invalid" : "")}>
                    <svg viewBox="0 0 16 16" width="14" height="14" className="lv2-search-icon">
                      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
                      <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    <input
                      ref={inputRef}
                      value={inputValue}
                      onChange={e => { setInputValue(e.target.value); setValidationMsg(""); }}
                      onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                      placeholder={tab.placeholder}
                      className="lv2-input"
                      autoFocus
                    />
                    {inputValue && (
                      <button className="lv2-clear" onClick={() => { setInputValue(""); inputRef.current?.focus(); }}>
                        <svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    )}
                  </div>
                  <button className={"lv2-btn" + (inputValue.trim() ? "" : " dim")} onClick={handleAnalyze}>
                    Analyse →
                  </button>
                </>
              )}
            </div>

            {/* US-01 AC2: validation message */}
            {validationMsg && <p className="lv2-validation">{validationMsg}</p>}

            {/* US-03: Quick-access chips — real demo companies */}
            {!validationMsg && tab.hints.length > 0 && (
              <div className="lv2-hints">
                <span className="lv2-hints-lbl mono">Try:</span>
                {tab.hints.map(h => (
                  <button key={h} className="lv2-hint"
                    onClick={() => {
                      setInputValue(h);
                      setValidationMsg("");
                      inputRef.current?.focus();
                    }}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="lv2-bottom-nav">
            <button className="lv2-nav-item" onClick={onCompany}>
              <span>Company Portfolio</span><span className="lv2-nav-arr">→</span>
            </button>
            <span className="lv2-nav-sep">·</span>
            <button className="lv2-nav-item" onClick={onCompany}>
              <span>Recent Analyses</span><span className="lv2-nav-arr">→</span>
            </button>
            <span className="lv2-nav-sep">·</span>
            <button className="lv2-nav-item" onClick={() => gwdToast("Five-dimension rubric, 0–100 · See §2 of any report")}>
              <span>Methodology</span><span className="lv2-nav-arr">→</span>
            </button>
          </nav>

        </div>
      </div>
    </div>
  );
}

function CompanyScreen({ onAnalyze, onReport, onOpenEvidence }) {
  const c = GWD_DATA.COMPANY;
  const claims = GWD_DATA.CLAIMS;
  const [sort, setSort]     = useState("score-desc");
  const [filter, setFilter] = useState("all");
  const peers = GWD_DATA.PEERS;

  const sortedClaims = useMemo(() => {
    let arr = [...claims];
    if (filter !== "all") arr = arr.filter(cl => riskBand(cl.score).key === filter);
    arr.sort((a, b) => sort === "score-desc" ? b.score - a.score : sort === "score-asc" ? a.score - b.score : 0);
    return arr;
  }, [sort, filter]);

  return (
    <div className="screen company-screen">
      {/* Company masthead */}
      <header className="co-head">
        <div className="co-head-l">
          <div className="co-head-kicker mono small mute">
            <span>{c.exchange}: {c.ticker}</span>
            <span className="sep">·</span>
            <span>ISIN {c.isin}</span>
            <span className="sep">·</span>
            <span>{c.fy}</span>
          </div>
          <h1 className="co-head-title">{c.legalName}</h1>
          <div className="co-head-blurb">{c.blurb}</div>
        </div>
        <div className="co-head-r">
          <div className="co-head-stat">
            <div className="co-head-stat-lbl mono small mute">AGGREGATE RISK</div>
            <div className="co-head-stat-num" style={{ color: "var(--c-bad)" }}>
              {c.aggregateRisk}
              <span className="co-head-stat-delta mono">▲{c.aggregateRiskTrend}</span>
            </div>
            <div className="co-head-stat-sub mono small mute">High Risk · since last sync</div>
          </div>
        </div>
      </header>

      {/* Stat grid */}
      <section className="co-stats">
        <StatCell lbl="Sector"          val={c.sector} />
        <StatCell lbl="Headquarters"    val={c.headquarters} />
        <StatCell lbl="Employees"       val={c.employees.toLocaleString()} mono />
        <StatCell lbl="Revenue"         val={c.revenue} mono />
        <StatCell lbl="Claims analysed" val={c.claimsAnalyzed} mono />
        <StatCell lbl="Last updated"    val={c.lastUpdated} mono small />
      </section>

      {/* Two-up: peer comparison + risk distribution */}
      <section className="co-row co-row-2">
        <div className="co-card">
          <div className="co-card-head">
            <div className="co-card-kicker mono small">PEER POSITION</div>
            <h3 className="co-card-title">Sector league table</h3>
            <span className="mono small mute">Integrated Oil & Gas · 6 of {peers.length} shown</span>
          </div>
          <table className="co-peers">
            <thead>
              <tr>
                <th>#</th><th>Company</th><th>Ticker</th><th className="ta-r">Risk</th><th></th>
              </tr>
            </thead>
            <tbody>
              {peers.slice().sort((a, b) => b.risk - a.risk).map((p, i) => (
                <tr key={p.id} className={p.self ? "self" : ""}>
                  <td className="mono mute">{String(i + 1).padStart(2, "0")}</td>
                  <td>{p.name}{p.self && <span className="self-tag mono">YOU</span>}</td>
                  <td className="mono mute">{p.ticker}</td>
                  <td className="ta-r mono" style={{ color: p.risk > 60 ? "var(--c-bad)" : p.risk > 30 ? "var(--c-warn)" : "var(--c-ok)" }}>
                    {p.risk}
                  </td>
                  <td className="ta-r" style={{ width: 120 }}>
                    <div className="peer-bar">
                      <div className="peer-bar-fill" style={{
                        width: p.risk + "%",
                        background: p.risk > 60 ? "var(--c-bad)" : p.risk > 30 ? "var(--c-warn)" : "var(--c-ok)",
                      }}></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="co-card">
          <div className="co-card-head">
            <div className="co-card-kicker mono small">RISK DISTRIBUTION</div>
            <h3 className="co-card-title">Claims by band</h3>
            <span className="mono small mute">{c.claimsAnalyzed} claims · {c.fy}</span>
          </div>
          <RiskDonut claims={claims} />
          <div className="co-trend">
            <div className="co-trend-lbl mono small mute">12-MONTH AGGREGATE RISK</div>
            <div className="co-trend-vals">
              {[58, 60, 59, 61, 62, 60, 63, 64, 63, 65, 66, 67].map((v, i) => (
                <div key={i} className="co-trend-bar" style={{
                  height: ((v - 50) * 3) + "px",
                  background: v > 60 ? "var(--c-bad)" : v > 30 ? "var(--c-warn)" : "var(--c-ok)",
                  opacity: 0.55 + i * 0.035,
                }}></div>
              ))}
            </div>
            <div className="co-trend-axis mono small mute">
              <span>Jun '25</span><span>Dec '25</span><span>May '26</span>
            </div>
          </div>
        </div>
      </section>

      {/* Claim portfolio */}
      <section className="co-portfolio">
        <div className="co-portfolio-head">
          <div>
            <div className="co-card-kicker mono small">CLAIM PORTFOLIO</div>
            <h3 className="co-card-title">{claims.length} analysed sustainability claims</h3>
          </div>
          <div className="co-portfolio-tools">
            <div className="seg">
              <button className={"seg-btn" + (filter === "all"    ? " on" : "")} onClick={() => setFilter("all")}>
                All <span className="mono mute">{claims.length}</span>
              </button>
              <button className={"seg-btn" + (filter === "high"   ? " on" : "")} onClick={() => setFilter("high")}>
                High <span className="mono mute">{claims.filter(x => x.score > 60).length}</span>
              </button>
              <button className={"seg-btn" + (filter === "medium" ? " on" : "")} onClick={() => setFilter("medium")}>
                Medium <span className="mono mute">{claims.filter(x => x.score > 30 && x.score <= 60).length}</span>
              </button>
              <button className={"seg-btn" + (filter === "low"    ? " on" : "")} onClick={() => setFilter("low")}>
                Low <span className="mono mute">{claims.filter(x => x.score <= 30).length}</span>
              </button>
            </div>
            <select className="co-sort mono small" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="score-desc">Risk: high → low</option>
              <option value="score-asc">Risk: low → high</option>
            </select>
            <button className="rep-action small" onClick={() => { onAnalyze(claims[0]); gwdToast("Starting fresh analysis run…"); }}>
              + New analysis
            </button>
          </div>
        </div>

        <ul className="claim-list">
          {sortedClaims.map(cl => (
            <ClaimRow
              key={cl.id}
              claim={cl}
              onAnalyze={() => onAnalyze(cl)}
              onReport={() => onReport(cl)}
              onEvidence={() => onOpenEvidence(cl)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCell({ lbl, val, mono, small }) {
  return (
    <div className="stat-cell">
      <div className="stat-cell-lbl mono small mute">{lbl}</div>
      <div className={"stat-cell-val" + (mono ? " mono" : "") + (small ? " sm" : "")}>{val}</div>
    </div>
  );
}

function ClaimRow({ claim, onAnalyze, onReport, onEvidence }) {
  const band = riskBand(claim.score);
  const topFlag = claim.flags[0];
  return (
    <li className={"claim-row r-" + band.tone}>
      <div className="claim-row-l">
        <div className="claim-row-id mono small mute">{claim.id}</div>
        <h4 className="claim-row-headline">{claim.headline}</h4>
        <div className="claim-row-quote">&ldquo;{claim.shortQuote}&rdquo;</div>
        <div className="claim-row-meta mono small mute">
          <span>{claim.source}</span>
          <span className="sep">·</span>
          <span>{claim.sourceType}</span>
          <span className="sep">·</span>
          <span>captured {claim.capturedAt}</span>
        </div>
        {topFlag && (
          <div className={"claim-row-flag sv-" + topFlag.severity}>
            <span className="claim-row-flag-tag mono">▲ {topFlag.type.toUpperCase()}</span>
            <span className="claim-row-flag-desc">{topFlag.description}</span>
          </div>
        )}
      </div>
      <div className="claim-row-c">
        <DimensionBars scores={claim.dimensionScores} dense />
      </div>
      <div className="claim-row-r">
        <div className="claim-row-score">
          <div className="claim-row-score-num" style={{ color: bandColor(band.tone) }}>{claim.score}</div>
          <div className="claim-row-score-band" style={{ color: bandColor(band.tone) }}>{band.label}</div>
          <div className="claim-row-score-out mono small mute">
            /100 · {claim.flags.length} flags · {claim.evidence.length} sources
          </div>
        </div>
        <div className="claim-row-actions">
          <button className="rep-action small" onClick={onReport}>Open report →</button>
          <button className="rep-action small ghost" onClick={onAnalyze}>Re-analyze</button>
          <button className="rep-action small ghost" onClick={onEvidence}>Evidence ↗</button>
        </div>
      </div>
    </li>
  );
}

function RiskDonut({ claims }) {
  const counts = { high: 0, medium: 0, low: 0 };
  claims.forEach(cl => counts[riskBand(cl.score).key]++);
  const total = claims.length;
  const seg = (n, color, offset) => {
    const c = 2 * Math.PI * 36;
    const len = (n / total) * c;
    return (
      <circle r="36" cx="48" cy="48" fill="none" stroke={color} strokeWidth="14"
        strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 48 48)" />
    );
  };
  const cTotal = 2 * Math.PI * 36;
  let off = 0;
  const arcs = [];
  if (counts.high)   { arcs.push(seg(counts.high,   "var(--c-bad)",  off)); off += (counts.high   / total) * cTotal; }
  if (counts.medium) { arcs.push(seg(counts.medium, "var(--c-warn)", off)); off += (counts.medium / total) * cTotal; }
  if (counts.low)    { arcs.push(seg(counts.low,    "var(--c-ok)",   off)); }

  return (
    <div className="risk-donut">
      <svg viewBox="0 0 96 96" width="120" height="120">
        <circle r="36" cx="48" cy="48" fill="none" stroke="var(--c-line)" strokeWidth="14" />
        {arcs.map((a, i) => <React.Fragment key={i}>{a}</React.Fragment>)}
        <text x="48" y="46" textAnchor="middle" fontSize="22" fontFamily="var(--font-serif)" fill="var(--c-ink-0)">{total}</text>
        <text x="48" y="62" textAnchor="middle" fontSize="9" letterSpacing="1" fontFamily="var(--font-mono)" fill="var(--c-ink-2)">CLAIMS</text>
      </svg>
      <ul className="risk-donut-legend">
        <li><span className="ld-dot r-bad"></span><span>High Risk</span><span className="mono">{counts.high}</span></li>
        <li><span className="ld-dot r-warn"></span><span>Medium Risk</span><span className="mono">{counts.medium}</span></li>
        <li><span className="ld-dot r-ok"></span><span>Low Risk</span><span className="mono">{counts.low}</span></li>
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────── Top bar
function TopBar({ route, onSearch, onPortfolio, onWatchlist, onReports, onOpenCmd, onOpenSettings }) {
  const isLanding   = route.name === "landing";
  const isPortfolio = route.name === "company";
  const isWatchlist = route.name === "watchlist";
  const isReports   = route.name === "reports";

  return (
    <header className="top-bar">
      <div className="top-bar-l">
        <div className="brand" onClick={onSearch} role="button" title="Home">
          <BrandMark />
          <div className="brand-text">
            <div className="brand-name">Greenwashing Detector</div>
            <div className="brand-sub mono">ESG fact-checking</div>
          </div>
        </div>
        <nav className="top-nav">
          <button className={"top-nav-btn" + (isLanding   ? " on" : "")} onClick={onSearch}>Search</button>
          <button className={"top-nav-btn" + (isPortfolio ? " on" : "")} onClick={onPortfolio}>Portfolio</button>
          <button className={"top-nav-btn" + (isWatchlist ? " on" : "")} onClick={onWatchlist}>Watchlist</button>
          <button className={"top-nav-btn" + (isReports   ? " on" : "")} onClick={onReports}>Reports</button>
        </nav>
      </div>
      <div className="top-bar-c">
        <button className="top-search" onClick={onOpenCmd}>
          <svg viewBox="0 0 16 16" width="13" height="13" className="top-search-icon">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span className="top-search-input">Search company, ticker, ISIN, or paste a claim…</span>
          <span className="top-search-kbd mono">⌘K</span>
        </button>
      </div>
      <div className="top-bar-r">
        <NotificationsMenu />
        <button className="icon-btn" title="Preferences (⌘,)" onClick={onOpenSettings}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 28 28" width="22" height="22" className="brand-mark">
      <rect x="1" y="1" width="26" height="26" rx="5" fill="var(--c-accent)" />
      <path d="M9 18 L9 10 L19 10 L19 13 L13 13 L13 14.5 L17 14.5 L17 17.5 L13 17.5 L13 18 Z" fill="#fff" opacity=".95"/>
      <circle cx="21" cy="20" r="2" fill="#fff" opacity=".85"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────── Ticker strip
function TickerStrip() {
  const items = GWD_DATA.WATCHLIST;
  const loop  = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-lbl mono">LIVE RISK FEED</div>
      <div className="ticker-track">
        <div className="ticker-row">
          {loop.map((it, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-ticker mono">{it.ticker}</span>
              <span className="ticker-risk mono" style={{
                color: it.risk > 60 ? "var(--c-bad)" : it.risk > 30 ? "var(--c-warn)" : "var(--c-ok)",
              }}>
                {it.risk}
              </span>
              <span className={"ticker-delta mono " + (it.delta > 0 ? "up" : it.delta < 0 ? "dn" : "fl")}>
                {it.delta > 0 ? "▲" : it.delta < 0 ? "▼" : "·"}{Math.abs(it.delta)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────── Sidebar
function Sidebar({ route, onPortfolio, onWatchlist, onReports }) {
  const list = GWD_DATA.WATCHLIST.slice(0, 6);
  return (
    <aside className="sidebar">
      <div className="side-section">
        <div className="side-head">
          <div className="side-head-lbl mono small">NAVIGATE</div>
        </div>
        <ul className="side-ctx-nav">
          <li className={"side-ctx-item" + (route.name === "company"   ? " on" : "")} onClick={onPortfolio}>
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3 5h8M3 7.5h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Portfolio
          </li>
          <li className={"side-ctx-item" + (route.name === "watchlist" ? " on" : "")} onClick={onWatchlist}>
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Watchlist
          </li>
          <li className={"side-ctx-item" + (route.name === "reports"   ? " on" : "")} onClick={onReports}>
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none">
              <path d="M3 2h8v10H3z" stroke="currentColor" strokeWidth="1.2" rx="1"/>
              <path d="M5 5h4M5 7h3M5 9h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Reports
          </li>
        </ul>
      </div>

      <div className="side-section">
        <div className="side-head">
          <div className="side-head-lbl mono small">WATCHLIST</div>
          <button className="side-head-btn" onClick={onWatchlist} title="See all">All →</button>
        </div>
        <ul className="side-list">
          {list.map(c => (
            <li key={c.id} className={"side-item" + (c.id === "petrovera-global" && route.name === "company" ? " on" : "")}>
              <div className="side-item-l">
                <div className="side-item-name">{c.name}</div>
                <div className="side-item-meta mono small mute">{c.ticker}</div>
              </div>
              <div className="side-item-r">
                <div className="side-item-risk mono" style={{
                  color: c.risk > 60 ? "var(--c-bad)" : c.risk > 30 ? "var(--c-warn)" : "var(--c-ok)",
                }}>
                  {c.risk}
                </div>
                <div className={"side-item-delta mono " + (c.delta > 0 ? "up" : c.delta < 0 ? "dn" : "fl")}>
                  {c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : "·"}{Math.abs(c.delta)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="side-section side-meta">
        <div className="side-meta-row mono small"><span className="mute">Engine</span><span>Gemini / Groq</span></div>
        <div className="side-meta-row mono small"><span className="mute">Rubric</span><span>v3.2 · 5 dim</span></div>
        <div className="side-meta-row mono small"><span className="mute">Last sync</span><span>just now</span></div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────── Watchlist screen
function WatchlistScreen({ onAnalyze }) {
  const list = GWD_DATA.WATCHLIST;

  // US-05: Always pass a templateClaim so AnalysisScreen shows the correct company name.
  // The backend returns real data; AnalysisScreen normalise() overwrites the template.
  function handleAnalyse(c) {
    onAnalyze(makeLiveClaim(c.name), c.name);
  }

  return (
    <div className="screen watchlist-screen">
      <header className="wl-head">
        <div>
          <div className="co-card-kicker mono small">WATCHLIST</div>
          <h1 className="co-head-title">Monitored Companies</h1>
          <p className="co-head-blurb">{list.length} companies · live risk feed · updated every 15 min</p>
        </div>
        <div className="wl-head-r">
          <button className="rep-action" onClick={() => gwdToast("Add company requires backend API", { kind: "warn" })}>
            + Add company
          </button>
        </div>
      </header>
      <table className="wl-table">
        <thead>
          <tr>
            <th>#</th><th>Company</th><th>Ticker</th><th>Sector</th>
            <th className="ta-r">Risk</th><th className="ta-r">Δ</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.slice().sort((a, b) => b.risk - a.risk).map((c, i) => (
            <tr key={c.id}>
              <td className="mono mute">{String(i + 1).padStart(2, "0")}</td>
              <td className="wl-name">{c.name}</td>
              <td className="mono mute">{c.ticker}</td>
              <td className="mute small">{c.sector}</td>
              <td className="ta-r mono" style={{
                color: c.risk > 60 ? "var(--c-bad)" : c.risk > 30 ? "var(--c-warn)" : "var(--c-ok)",
                fontWeight: 600,
              }}>
                {c.risk}
              </td>
              <td className={"ta-r mono small " + (c.delta > 0 ? "r-bad" : c.delta < 0 ? "r-ok" : "mute")}>
                {c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : "·"}{Math.abs(c.delta)}
              </td>
              <td className="ta-r">
                <button className="rep-action small" onClick={() => handleAnalyse(c)}>
                  Analyse →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────── Reports screen
// FR-29: ReportsScreen now calls GET /api/history for real data.
// Falls back to empty state (not Petrovera demo data) if API is unavailable.
function ReportsScreen({ onOpenReport }) {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res  = await fetch("/api/history");
        const data = await res.json();
        setReports(data.results || []);
      } catch (e) {
        console.warn("History API unavailable:", e);
        setApiError(true);
        setReports([]);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  return (
    <div className="screen reports-screen">
      <header className="wl-head">
        <div>
          <div className="co-card-kicker mono small">SAVED REPORTS</div>
          <h1 className="co-head-title">Analysis History</h1>
          <p className="co-head-blurb">
            {loading
              ? "Loading…"
              : apiError
              ? "API unavailable · showing empty history"
              : `${reports.length} completed ${reports.length === 1 ? "analysis" : "analyses"}`}
          </p>
        </div>
        <button className="rep-action" onClick={() => gwdToast("Bulk export queued", { kind: "ok" })}>
          Export all ↓
        </button>
      </header>

      {loading ? (
        <div className="mono small mute" style={{ padding: "48px 4px" }}>
          Loading history<span className="dots"><span/><span/><span/></span>
        </div>
      ) : reports.length === 0 ? (
        <div className="mono small mute" style={{ padding: "48px 4px" }}>
          No analyses yet — search a company to get started.
        </div>
      ) : (
        <ul className="rpts-list">
          {reports.map(r => {
            const band = riskBand(r.score ?? 0);
            return (
              <li key={r.job_id} className="rpts-row" onClick={() => onOpenReport(r)}>
                <div className="rpts-l">
                  <div className="rpts-meta mono small mute">
                    {r.job_id} · {(r.completed_at || "").slice(0, 10)}
                  </div>
                  <div className="rpts-title">{r.company_name}</div>
                  <div className="rpts-src mono small mute">
                    GreenCheck live analysis · AI Analysis
                  </div>
                </div>
                <div className="rpts-r">
                  <div className="rpts-score mono" style={{
                    color: band.tone === "bad"  ? "var(--c-bad)"
                         : band.tone === "warn" ? "var(--c-warn)"
                         :                        "var(--c-ok)",
                  }}>
                    {r.score ?? "—"}
                  </div>
                  <div className="rpts-band small mute">{r.risk_level}</div>
                </div>
                <div className="rpts-actions">
                  <button className="rep-action small"
                    onClick={e => { e.stopPropagation(); onOpenReport(r); }}>
                    Open →
                  </button>
                  <button className="rep-action small ghost"
                    onClick={e => {
                      e.stopPropagation();
                      gwdToast(`${r.job_id}_report.pdf queued`, { kind: "ok", icon: "↓" });
                    }}>
                    PDF ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────── Root App
export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { applyPalette(t.palette); }, [t.palette]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--display-family",
      t.displayFamily === "sans" ? "var(--font-sans)" : "var(--font-serif)",
    );
    document.documentElement.setAttribute("data-density", t.density);
  }, [t.displayFamily, t.density]);

  const [route,        setRoute]        = useState({ name: "landing" });
  const [evidenceOpen, setEvidenceOpen] = useState(null);
  const [cmdOpen,      setCmdOpen]      = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Navigation helpers
  const goSearch    = ()             => setRoute({ name: "landing" });
  const goPortfolio = ()             => setRoute({ name: "company" });
  const goWatchlist = ()             => setRoute({ name: "watchlist" });
  const goReports   = ()             => setRoute({ name: "reports" });
  const goAnalyze   = (claim, query) => setRoute({ name: "analysis", claim, query });
  const goReport    = (claim, query) => setRoute({ name: "report",   claim, query });

  const showSidebar = ["company", "watchlist", "reports"].includes(route.name);
  const showTicker  = t.showTickerStrip && route.name !== "landing";

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen(true); }
      if (mod && e.key === ",")               { e.preventDefault(); setSettingsOpen(true); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleCmdPick(kind, item) {
    if (kind === "company") {
      // US-05: Command palette also uses templateClaim for real company navigation
      const isReal = DEMO_COMPANIES.some(d =>
        item.name.toLowerCase().includes(d) || d.includes(item.name.toLowerCase())
      );
      if (isReal) {
        goAnalyze(makeLiveClaim(item.name), item.name);
        gwdToast("Analysing · " + item.name);
      } else if (item.id === "petrovera-global") {
        goPortfolio();
        gwdToast("Opened · Petrovera Global plc");
      } else {
        gwdToast(item.name + " — triggering live analysis", { kind: "info" });
        goAnalyze(makeLiveClaim(item.name), item.name);
      }
    } else if (kind === "claim") {
      goReport(item);
      gwdToast("Opened report · " + item.id);
    } else if (kind === "action") {
      if (item.id === "act-new")    goSearch();
      if (item.id === "act-export") gwdToast("Report queued for export", { kind: "ok" });
      if (item.id === "act-help")   gwdToast("See §2 of any credibility report");
    }
  }

  const tweaksPanel = (
    <TweaksPanel>
      <TweakSection label="Look" />
      <TweakColor label="Palette" value={t.palette}
        options={[
          ["#3F5E48", "#FAFAF8", "#0F1A14"],
          ["#3D7A8A", "#F7F8FA", "#0F1720"],
          ["#2D6A4F", "#F8F8F5", "#10130E"],
        ]}
        onChange={v => {
          const key = v[0] === "#3D7A8A" ? "slate" : v[0] === "#2D6A4F" ? "forest" : "sage";
          setTweak("palette", key);
        }}
      />
      <TweakRadio label="Display font" value={t.displayFamily}
        options={["serif", "sans"]} onChange={v => setTweak("displayFamily", v)} />
      <TweakRadio label="Density" value={t.density}
        options={["compact", "regular", "comfy"]} onChange={v => setTweak("density", v)} />
      <TweakSection label="Report" />
      <TweakSelect label="Score style" value={t.scoreVariant}
        options={[
          { value: "arc",    label: "Semicircular gauge" },
          { value: "bar",    label: "Banded thermometer" },
          { value: "letter", label: "Credit-rating letter" },
        ]}
        onChange={v => setTweak("scoreVariant", v)}
      />
      <TweakToggle label="Show ticker strip" value={t.showTickerStrip}
        onChange={v => setTweak("showTickerStrip", v)} />
    </TweaksPanel>
  );

  return (
    <div className="gwd-app" data-route={route.name}>
      <TopBar
        route={route}
        onSearch={goSearch}
        onPortfolio={goPortfolio}
        onWatchlist={goWatchlist}
        onReports={goReports}
        onOpenCmd={() => setCmdOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {showTicker && <TickerStrip />}

      <div className="gwd-body">
        {showSidebar && (
          <Sidebar route={route} onPortfolio={goPortfolio} onWatchlist={goWatchlist} onReports={goReports} />
        )}
        <main className="gwd-main">
          {route.name === "landing"   && <LandingScreen onCompany={goPortfolio} onAnalyze={goAnalyze} />}
          {route.name === "company"   && <CompanyScreen onAnalyze={goAnalyze} onReport={goReport} onOpenEvidence={(c, e) => setEvidenceOpen({ claim: c, ev: e })} />}
          {route.name === "watchlist" && <WatchlistScreen onAnalyze={goAnalyze} />}
          {route.name === "reports"   && <ReportsScreen onOpenReport={goReport} />}
          {route.name === "analysis"  && (
            <AnalysisScreen
              claim={route.claim}
              query={route.query}
              onComplete={result => goReport(result ?? route.claim, route.query)}
            />
          )}
          {route.name === "report" && (
            <ReportScreen
              claim={route.claim}
              query={route.query}
              scoreVariant={t.scoreVariant}
              onBack={() => goReports()}
              onOpenEvidence={(c, e) => setEvidenceOpen({ claim: c, ev: e })}
            />
          )}
        </main>
      </div>

      {evidenceOpen && (
        <EvidenceDrawer
          claim={evidenceOpen.claim}
          ev={evidenceOpen.ev}
          onClose={() => setEvidenceOpen(null)}
        />
      )}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onPick={handleCmdPick} />
      <SettingsSheet  open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
      {tweaksPanel}
    </div>
  );
}
