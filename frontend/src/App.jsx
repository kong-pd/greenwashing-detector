// App.jsx — main shell: top bar, left watchlist, main canvas, evidence drawer.
// Drives the route between Landing → Company portfolio → Analysis → Report.
//
// Patches applied vs original:
//   US-03: Landing hints → real demo companies (Shell, H&M, Patagonia, Tesla, BP)
//   US-04: Real-company searches pass templateClaim so AnalysisScreen shows correct name
//   US-05: WatchlistScreen handleAnalyse also uses templateClaim

import React, { useState, useEffect, useMemo } from "react";
import { gwdToast } from "./toast.js";
import { riskBand, bandColor, DimensionBars, RiskPill, DIMENSION_META, MethodologyPanel } from "./components/SharedComponents.jsx";
import {
  useTweaks, TweaksPanel,
  TweakSection, TweakColor, TweakRadio, TweakSelect, TweakToggle,
} from "./components/TweaksPanel.jsx";
import { Toaster } from "./components/Interactions.jsx";
import { AnalysisScreen, normalise } from "./screens/AnalysisScreen.jsx";
import { ReportScreen, EvidenceDrawer } from "./screens/ReportScreen.jsx";
import { getReport } from "./api/client.js";

const TWEAK_DEFAULTS = {
  palette: "sage",
  scoreVariant: "arc",
  density: "regular",
  displayFamily: "serif",
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

// Build a minimal "live analysis" claim template for external company searches.
// AnalysisScreen fetches real data and overwrites every field.
// FR-37: live claims start empty — flags/evidence/dimensions come from the API only
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

function LandingScreen({ onAnalyze, onMethodology }) {
  const [activeTab, setActiveTab]     = useState("company");
  const [inputValue, setInputValue]   = useState("");
  const [claimCompany, setClaimCompany] = useState(""); // P2-6: company behind a pasted claim
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

  // US-01: search triggers analysis pipeline. Every input becomes a LIVE
  // claim — the byHash demo-claim lottery is retired (C-3 / P2-7).
  function handleAnalyze() {
    const val = inputValue.trim();
    if (!val) {
      setValidationMsg("Enter a company name, ticker, or paste a claim to continue");
      inputRef.current?.focus();
      return;
    }
    onAnalyze(makeLiveClaim(val), val);
  }

  // P2-6: the Claim tab feeds the user's own text into the real pipeline
  // as manual content — no scraping, no demo mapping.
  function handleClaimAnalyze() {
    const name = claimCompany.trim();
    const text = inputValue.trim();
    if (!name) {
      setValidationMsg("Name the company behind this claim");
      return;
    }
    if (!text) {
      setValidationMsg("Paste the claim you want analysed");
      return;
    }
    onAnalyze({ ...makeLiveClaim(name), _manualContent: text }, name);
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

            {activeTab === "claim" ? (
              <div className="lv2-claim-form">
                <div className={"lv2-input-box" + (validationMsg ? " invalid" : "")}>
                  <input
                    value={claimCompany}
                    onChange={e => { setClaimCompany(e.target.value); setValidationMsg(""); }}
                    placeholder="Company behind this claim — e.g. Nordwind Energy"
                    className="lv2-input"
                  />
                </div>
                <div className={"lv2-input-box" + (validationMsg ? " invalid" : "")} style={{ alignItems: "flex-start" }}>
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={e => { setInputValue(e.target.value); setValidationMsg(""); }}
                    placeholder={tab.placeholder}
                    className="lv2-input"
                    rows={3}
                    style={{ resize: "vertical", minHeight: 64 }}
                  />
                </div>
                <button className={"lv2-btn" + (inputValue.trim() && claimCompany.trim() ? "" : " dim")}
                  onClick={handleClaimAnalyze}>
                  Analyse claim →
                </button>
              </div>
            ) : (
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
            )}

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
            <button className="lv2-nav-item" onClick={onMethodology}>
              <span>Methodology</span><span className="lv2-nav-arr">→</span>
            </button>
          </nav>

        </div>
      </div>
    </div>
  );
}

// P2-9: the top bar carries exactly the product's two real routes.
// The ⌘K palette, notifications bell, sandbox account and fake settings
// gear are gone with the demo universe (P2-5 / P2-8).
function TopBar({ route, onSearch, onReports }) {
  const isLanding = route.name === "landing";
  const isReports = route.name === "reports";

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
          <button className={"top-nav-btn" + (isLanding ? " on" : "")} onClick={onSearch}>Search</button>
          <button className={"top-nav-btn" + (isReports ? " on" : "")} onClick={onReports}>Reports</button>
        </nav>
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

  // C-2: a history row is a 5-field summary, not a report. Opening one
  // fetches the full record through the real GET /api/report/{job_id}
  // (DB first, NFR-09 relay fallback) and only navigates on success —
  // the empty-shell report is gone for good.
  const [openingId, setOpeningId] = useState(null);
  async function openReport(r) {
    if (openingId) return;
    setOpeningId(r.job_id);
    try {
      const raw  = await getReport(r.job_id);
      const full = normalise(raw, makeLiveClaim(r.company_name || "Unknown"));
      if (!full) {
        gwdToast("Report no longer available — it may have expired", { kind: "warn" });
        return;
      }
      onOpenReport(full, r.company_name, "reports");
    } catch {
      gwdToast("Couldn't load the report — backend unreachable", { kind: "warn" });
    } finally {
      setOpeningId(null);
    }
  }

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
              <li key={r.job_id} className="rpts-row" onClick={() => openReport(r)}>
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
                    disabled={openingId === r.job_id}
                    onClick={e => { e.stopPropagation(); openReport(r); }}>
                    {openingId === r.job_id ? "Opening…" : "Open →"}
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
  const [methOpen,     setMethOpen]     = useState(false); // P3-12: real Methodology from landing
  useEffect(() => {
    if (!methOpen) return;
    const onKey = e => { if (e.key === "Escape") setMethOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [methOpen]);

  // Navigation helpers
  const goSearch  = ()             => setRoute({ name: "landing" });
  const goReports = ()             => setRoute({ name: "reports" });
  const goAnalyze = (claim, query) => setRoute({ name: "analysis", claim, query });
  // P3-12 (C-5): a report remembers where it was opened from, so both the
  // breadcrumb root and the ← button are honest about the way back.
  const goReport  = (claim, query, origin = "search") =>
    setRoute({ name: "report", claim, query, origin });

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
    </TweaksPanel>
  );

  return (
    <div className="gwd-app" data-route={route.name}>
      <TopBar route={route} onSearch={goSearch} onReports={goReports} />

      <div className="gwd-body">
        <main className="gwd-main">
          {route.name === "landing"   && <LandingScreen onAnalyze={goAnalyze} onMethodology={() => setMethOpen(true)} />}
          {route.name === "reports"   && <ReportsScreen onOpenReport={goReport} />}
          {route.name === "analysis"  && (
            <AnalysisScreen
              claim={route.claim}
              query={route.query}
              onComplete={result => goReport(result ?? route.claim, route.query, "search")}
              onBack={goSearch}
            />
          )}
          {route.name === "report" && (
            <ReportScreen
              claim={route.claim}
              query={route.query}
              origin={route.origin}
              scoreVariant={t.scoreVariant}
              onBack={() => (route.origin === "reports" ? goReports() : goSearch())}
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
      {methOpen && (
        <div className="cmd-wrap"
          onClick={e => { if (e.target.classList.contains("cmd-wrap")) setMethOpen(false); }}>
          <div className="settings" role="dialog" aria-label="Methodology">
            <header className="settings-head">
              <div>
                <div className="mono small mute" style={{ letterSpacing: ".06em", marginBottom: 4 }}>
                  SCORING RUBRIC
                </div>
                <h3 className="settings-title">Methodology</h3>
              </div>
              <button className="ev-drawer-x" onClick={() => setMethOpen(false)} aria-label="Close">✕</button>
            </header>
            <div style={{ padding: "4px 20px 20px", maxHeight: "70vh", overflow: "auto" }}>
              <MethodologyPanel />
            </div>
          </div>
        </div>
      )}
      <Toaster />
      {tweaksPanel}
    </div>
  );
}
