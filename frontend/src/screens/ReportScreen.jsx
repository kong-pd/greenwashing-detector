// ReportScreen.jsx — the hero output: a credibility report on a single claim.
// FR-34: §5 Methodology section shows all 5 standards. Standard badges in §2.
// Fix: rep-masthead wrapper restored; isLive helper for conditional masthead.

import { useState, useEffect } from "react";
import {
  riskBand, bandColor,
  ScoreDial, DimensionBars, FlagCard, EvidenceRow, ReportSection,
  StandardBadge, MethodologyPanel,
  DIMENSION_META,
} from "../components/SharedComponents.jsx";
import { GWD_DATA } from "../data.js";
import { gwdToast } from "../toast.js";

export function ReportScreen({ claim, query, scoreVariant = "arc", onBack, onOpenEvidence }) {
  const [showMeth, setShowMeth] = useState(false);
  const band = riskBand(claim.score);
  const c    = GWD_DATA.COMPANY;

  // True when the claim came from a live external search (not Petrovera portfolio)
  const isLive = claim.id === "LIVE" || !String(claim.id ?? "").startsWith("CLM-");

  function handleExportPDF() {
    const prev = document.title;
    document.title = `${isLive ? claim.headline : c.ticker}_${claim.id}_credibility_report`;
    window.print();
    document.title = prev;
    gwdToast("Print dialog opened — save as PDF", { kind: "ok", icon: "↓" });
  }

  return (
    <div className="report-screen">

      {/* ── Sticky breadcrumb ── */}
      <header className="rep-topbar">
        <div className="rep-topbar-inner">
          <div className="rep-topbar-l">
            <button className="rep-back" onClick={onBack}>
              <svg viewBox="0 0 16 16" width="11" height="11">
                <path d="M10 2 L4 8 L10 14" stroke="currentColor" strokeWidth="1.6"
                      fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Reports
            </button>
            <span className="rep-crumb-sep">/</span>
            <span className="rep-crumb-co mono">{isLive ? claim.headline : c.ticker}</span>
            <span className="rep-crumb-sep">/</span>
            <span className="rep-crumb-id mono">{claim.id}</span>
            {query && (
              <>
                <span className="rep-crumb-sep">·</span>
                <span className="rep-crumb-query mono small mute">searched "{query}"</span>
              </>
            )}
          </div>

          {/* FR-34: Standard badges in topbar */}
          <div className="rep-topbar-standards">
            {DIMENSION_META.map(d => (
              <StandardBadge key={d.key} standard={d.standard} compact />
            ))}
          </div>

          <div className="rep-topbar-score">
            <span
              className="rep-topbar-score-num mono"
              style={{ color: band.tone === "bad" ? "var(--c-bad)" : band.tone === "warn" ? "var(--c-warn)" : "var(--c-ok)" }}
            >
              {claim.score}
            </span>
            <span className="rep-topbar-score-lbl">{claim.riskLevel}</span>
          </div>

          <div className="rep-topbar-r">
            <span className="mono small mute">Issued {claim.analyzedAt}</span>
            <button className="rep-action small" onClick={handleExportPDF}>Export PDF ↓</button>
            <button
              className="rep-action small"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `"${claim.shortQuote || claim.headline}" — GWD report ${claim.id} (risk ${claim.score}/100). ${claim.source}.`
                );
                gwdToast("Citation copied", { kind: "ok" });
              }}
            >
              Cite ⌘C
            </button>
          </div>
        </div>
      </header>

      {/* ── All content inside centred inner wrapper ── */}
      <div className="rep-inner">

        {/* ── Masthead ── */}
        <div className="rep-masthead">
          <div className="rep-mast-kicker mono">
            {isLive ? (
              <>
                <span>LIVE ANALYSIS</span>
                <span className="sep">·</span>
                <span>GreenCheck ESG Engine</span>
                <span className="sep">·</span>
                <span>claude-sonnet-4 · rubric v3.2</span>
              </>
            ) : (
              <>
                <span>{c.legalName.toUpperCase()}</span>
                <span className="sep">·</span>
                <span>{c.exchange}: {c.ticker}</span>
                <span className="sep">·</span>
                <span>{c.sector}</span>
              </>
            )}
          </div>

          <h1 className="rep-mast-title">{claim.headline}</h1>

          <div className="rep-mast-lede">
            <blockquote>
              {isLive ? (
                <span>{claim.headline} — AI greenwashing risk analysis</span>
              ) : (
                <>
                  <span className="rep-mast-quotemark">"</span>
                  {claim.shortQuote}
                  <span className="rep-mast-quotemark">"</span>
                </>
              )}
            </blockquote>
            <div className="rep-mast-attr mono">
              — {isLive ? "GreenCheck live analysis" : claim.source}
            </div>
          </div>
        </div>{/* /rep-masthead */}

        {/* ── Hero verdict band ── */}
        <section className="rep-verdict">
          <div className="rep-verdict-l">
            <div className="rep-verdict-kicker mono">VERDICT</div>
            <ScoreDial score={claim.score} variant={scoreVariant} size={280} />
          </div>

          <div className="rep-verdict-c">
            <div className="rep-verdict-meta">
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">RISK LEVEL</div>
                <div className="rep-vm-val">
                  <span style={{ color: bandColor(band.tone) }}>● {claim.riskLevel}</span>
                </div>
              </div>
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">MODEL CONFIDENCE</div>
                <div className="rep-vm-val mono">{Math.round((claim.confidence ?? 0.85) * 100)}%</div>
              </div>
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">EVIDENCE SOURCES</div>
                <div className="rep-vm-val mono">{(claim.evidence ?? []).length} cited</div>
              </div>
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">FLAGS RAISED</div>
                <div className="rep-vm-val mono">
                  {(claim.flags ?? []).length}
                  <span className="rep-vm-flagcounts">
                    {(claim.flags ?? []).filter(f => f.severity === "high").length > 0 && (
                      <span className="r-bad mono">
                        &nbsp;● {(claim.flags ?? []).filter(f => f.severity === "high").length} high
                      </span>
                    )}
                    {(claim.flags ?? []).filter(f => f.severity === "medium").length > 0 && (
                      <span className="r-warn mono">
                        &nbsp;● {(claim.flags ?? []).filter(f => f.severity === "medium").length} med
                      </span>
                    )}
                    {(claim.flags ?? []).filter(f => f.severity === "low").length > 0 && (
                      <span className="r-ok mono">
                        &nbsp;● {(claim.flags ?? []).filter(f => f.severity === "low").length} low
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">SOURCE TYPE</div>
                <div className="rep-vm-val">{claim.sourceType || "AI Analysis"}</div>
              </div>
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">CAPTURED</div>
                <div className="rep-vm-val mono">{claim.capturedAt}</div>
              </div>
              {/* FR-34: Standards alignment */}
              <div className="rep-vm-row">
                <div className="rep-vm-lbl mono small mute">STANDARDS APPLIED</div>
                <div className="rep-vm-val rep-vm-standards">
                  {DIMENSION_META.map(d => (
                    <StandardBadge key={d.key} standard={d.standard} compact />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rep-verdict-r">
            <div className="rep-vm-lbl mono small mute">EXPOSURE</div>
            <ExposureGrid claim={claim} />
          </div>
        </section>

        {/* §1 Executive summary */}
        <ReportSection kicker="§ 1 · EXECUTIVE SUMMARY" title="Analyst summary">
          <div className="rep-summary">
            <p className="rep-summary-lede">
              {claim.summary || "Analysis in progress — summary will appear here."}
            </p>
            <div className="rep-summary-side">
              <div className="rep-byline mono small mute">
                <div>Prepared by</div>
                <div className="rep-byline-name">GWD Analyzer · claude-sonnet-4</div>
              </div>
              <div className="rep-byline mono small mute">
                <div>Rubric version</div>
                <div className="rep-byline-name">v3.2 · 5 dimensions · 0–100</div>
              </div>
              <div className="rep-byline mono small mute">
                <div>Standards aligned</div>
                <div className="rep-byline-standards">
                  {DIMENSION_META.map(d => (
                    <StandardBadge key={d.key} standard={d.standard} compact />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ReportSection>

        {/* §2 Dimensional scoring — FR-34 badges inside DimensionBars */}
        <ReportSection
          kicker="§ 2 · DIMENSIONAL SCORING"
          title="Five-dimension rubric"
          right={<span className="mono small mute">higher = greater risk · max 20 each</span>}
        >
          <DimensionBars scores={claim.dimensionScores ?? {}} />
        </ReportSection>

        {/* §3 Flagged findings */}
        <ReportSection
          kicker="§ 3 · FLAGGED FINDINGS"
          title="Three highest-risk findings"
          right={<span className="mono small mute">one per top-scoring dimension</span>}
        >
          <div className="rep-flags">
            {(claim.flags ?? []).map((f, i) => (
              <FlagCard key={i} flag={f} idx={i} />
            ))}
          </div>
        </ReportSection>

        {/* §4 Evidence trail */}
        <ReportSection
          kicker="§ 4 · EVIDENCE TRAIL"
          title="Sources ranked by weight"
          right={
            <button className="rep-action small" onClick={() => onOpenEvidence?.(claim)}>
              Open full trail →
            </button>
          }
        >
          <div className="rep-evidence">
            {(claim.evidence ?? []).slice(0, 5).map((ev, i) => (
              <EvidenceRow key={ev.id} ev={ev} index={i} onOpen={() => onOpenEvidence?.(claim, ev)} />
            ))}
            {(claim.evidence ?? []).length > 5 && (
              <button className="rep-evidence-more mono" onClick={() => onOpenEvidence?.(claim)}>
                + {claim.evidence.length - 5} more sources · open evidence trail →
              </button>
            )}
          </div>
        </ReportSection>

        {/* §5 Methodology — FR-34 full rubric table */}
        <ReportSection
          kicker="§ 5 · METHODOLOGY"
          title="Scoring rubric & regulatory alignment"
          right={
            <button
              className="rep-action small ghost"
              onClick={() => setShowMeth(v => !v)}
            >
              {showMeth ? "Collapse ▲" : "Expand ▼"}
            </button>
          }
        >
          {showMeth ? (
            <MethodologyPanel />
          ) : (
            <div className="meth-collapsed">
              <p className="meth-collapsed-text">
                GreenCheck scores each claim against five independently verified dimensions,
                each mapped to an international regulatory standard. Evidence weights are clamped
                to source-kind-specific bands to prevent AI weight manipulation.
              </p>
              <div className="meth-collapsed-standards">
                {DIMENSION_META.map(d => (
                  <div key={d.key} className="meth-collapsed-row">
                    <StandardBadge standard={d.standard} />
                    <span className="meth-collapsed-dim">{d.label}</span>
                    <span className="meth-collapsed-full mono small mute">{d.standardFull}</span>
                  </div>
                ))}
              </div>
              <button
                className="rep-action small"
                style={{ marginTop: 14 }}
                onClick={() => setShowMeth(true)}
              >
                Show full rubric table ▼
              </button>
            </div>
          )}
        </ReportSection>

        {/* Footer */}
        <footer className="rep-footer">
          <div className="rep-footer-l mono small mute">
            <div>Greenwashing Detector · ImagineHack 2026 · A Sustainable Tomorrow · Taylor's University</div>
            <div>AI engine: claude-sonnet-4 · Standards: TCFD · GRI 305 · GRI 2-27 · EU Taxonomy Art. 8 · EU GCD 2024</div>
            <div>This report is generated by an AI fact-checking system. Findings are analytical opinions, not legal determinations.</div>
          </div>
          <div className="rep-footer-r mono small mute">
            <div>Report ID</div>
            <div className="rep-footer-id">{claim.id}</div>
          </div>
        </footer>

      </div>{/* /rep-inner */}
    </div>
  );
}

// ── 5-cell exposure grid ──────────────────────────────────────────────────────
function ExposureGrid({ claim }) {
  const cells = DIMENSION_META.map(d => {
    const v    = (claim.dimensionScores ?? {})[d.key] || 0;
    const tone = v >= 14 ? "bad" : v >= 8 ? "warn" : "ok";
    return { label: d.label.split(" ")[0], v, tone, full: d.label, standard: d.standard };
  });
  return (
    <div className="exposure-grid">
      {cells.map((cell, i) => (
        <div key={i} className={"exp-cell t-" + cell.tone} title={cell.full + " · " + cell.v + "/20"}>
          <div className="exp-cell-v mono">{cell.v}</div>
          <div className="exp-cell-l">{cell.label}</div>
          <div className="exp-cell-std">
            <StandardBadge standard={cell.standard} compact />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Evidence Drawer ───────────────────────────────────────────────────────────
export function EvidenceDrawer({ claim, ev, onClose }) {
  if (!claim) return null;
  const evidence = claim.evidence ?? [];
  const [selected, setSelected] = useState(ev || evidence[0]);
  useEffect(() => { setSelected(ev || evidence[0]); }, [claim, ev]);

  if (!selected) return null;

  return (
    <div className="ev-drawer-wrap">
      <div className="ev-drawer-scrim" onClick={onClose}></div>
      <aside className="ev-drawer" role="dialog" aria-label="Evidence trail">
        <header className="ev-drawer-head">
          <div className="ev-drawer-head-l">
            <div className="mono small mute">EVIDENCE TRAIL · {claim.id}</div>
            <h2 className="ev-drawer-title">{claim.headline}</h2>
          </div>
          <button className="ev-drawer-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="ev-drawer-body">
          <aside className="ev-drawer-list">
            <div className="ev-drawer-list-head mono small mute">
              <span>{evidence.length} sources</span>
              <span>weight</span>
            </div>
            {evidence.map((e, i) => (
              <button
                key={e.id}
                className={"ev-drawer-list-item" + (e.id === selected.id ? " on" : "")}
                onClick={() => setSelected(e)}
              >
                <div className="ev-dli-l">
                  <div className="ev-dli-num mono">{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <div className={"ev-dli-kind k-" + e.kind.toLowerCase()}>{e.kind}</div>
                    <div className="ev-dli-title">{e.title}</div>
                    <div className="ev-dli-meta mono">{e.org} · {e.date}</div>
                  </div>
                </div>
                <div className="ev-dli-r">
                  <div className="ev-dli-bar">
                    <div className="ev-dli-fill" style={{ width: (e.weight * 100) + "%" }}></div>
                  </div>
                  <div className="ev-dli-w mono">{Math.round(e.weight * 100)}</div>
                </div>
              </button>
            ))}
          </aside>

          <section className="ev-drawer-detail">
            <div className="ev-detail-head">
              <div className={"ev-detail-kind k-" + selected.kind.toLowerCase()}>{selected.kind}</div>
              <h3 className="ev-detail-title">{selected.title}</h3>
              <div className="ev-detail-meta mono small mute">
                <span>{selected.org}</span>
                <span className="sep">·</span>
                <span>{selected.date}</span>
                <span className="sep">·</span>
                <span>weight {Math.round(selected.weight * 100)}/100</span>
              </div>
            </div>

            <div className="ev-detail-quote">
              <span className="ev-quotemark">"</span>
              {selected.quote}
              <span className="ev-quotemark">"</span>
            </div>

            <div className="ev-detail-grid">
              <div className="ev-detail-cell">
                <div className="mono small mute">SOURCE URL</div>
                <div className="mono">{selected.url}</div>
              </div>
              <div className="ev-detail-cell">
                <div className="mono small mute">WEIGHT BREAKDOWN</div>
                <WeightBreakdown ev={selected} />
              </div>
              <div className="ev-detail-cell wide">
                <div className="mono small mute">WHY THIS MATTERS</div>
                <div className="ev-detail-why">{whyText(selected)}</div>
              </div>
              <div className="ev-detail-cell wide">
                <div className="mono small mute">SUPPORTS / CONTRADICTS</div>
                <SupportsRow ev={selected} claim={claim} />
              </div>
            </div>

            <footer className="ev-detail-actions">
              <button className="rep-action" onClick={() => gwdToast("Opening source · " + selected.url)}>
                Open source ↗
              </button>
              <button className="rep-action" onClick={() => {
                navigator.clipboard?.writeText(
                  `${selected.title} (${selected.org}, ${selected.date}). ${selected.url}`
                );
                gwdToast("Source citation copied", { kind: "ok" });
              }}>
                Cite this source
              </button>
              <button className="rep-action ghost" onClick={() => gwdToast("Thanks — flagged for analyst review")}>
                Flag as misranked
              </button>
            </footer>
          </section>
        </div>
      </aside>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function WeightBreakdown({ ev }) {
  const reliability =
    ev.kind === "Filing" || ev.kind === "Database" ? 0.92 :
    ev.kind === "Document"   ? 0.78 :
    ev.kind === "News"       ? 0.65 :
    ev.kind === "Linguistic" ? 0.55 : 0.7;
  const recency   = ev.date >= "2026-01-01" ? 0.95 : ev.date >= "2025-01-01" ? 0.78 : 0.55;
  const relevance = ev.weight;
  const factors   = [
    { lbl: "Source reliability", v: reliability },
    { lbl: "Recency",            v: recency     },
    { lbl: "Relevance",          v: relevance   },
  ];
  return (
    <div className="weight-bk">
      {factors.map(f => (
        <div key={f.lbl} className="weight-bk-row">
          <span className="weight-bk-lbl">{f.lbl}</span>
          <div className="weight-bk-rail">
            <div className="weight-bk-fill" style={{ width: (f.v * 100) + "%" }}></div>
          </div>
          <span className="weight-bk-v mono">{Math.round(f.v * 100)}</span>
        </div>
      ))}
    </div>
  );
}

function SupportsRow({ ev, claim }) {
  const contradicts =
    (claim.flags ?? []).some(f => f.type === "Data Contradiction") &&
    (ev.kind === "Database" || ev.kind === "Filing") &&
    ev.weight >= 0.8;
  const supports = !contradicts && ev.weight >= 0.6;
  return (
    <div className="supports-row">
      <span className={"supports-pill" + (contradicts ? " contradicts" : supports ? " supports" : " neutral")}>
        {contradicts ? "⊗ Contradicts claim" : supports ? "✓ Supports claim" : "○ Neutral context"}
      </span>
      <span className="supports-note mono small mute">
        relative to: <em>{claim.headline}</em>
      </span>
    </div>
  );
}

function whyText(ev) {
  if (ev.kind === "Filing" || ev.kind === "Database") {
    return "Primary-source dataset, high reliability. Cross-checked against the company's self-reported figures; discrepancies feed directly into the Data Consistency dimension (GRI 305).";
  }
  if (ev.kind === "News") {
    return "Independent media coverage from a recognised outlet. Used to surface reputational signals and any active regulatory exposure feeding the Negative News dimension (GRI 2-27).";
  }
  if (ev.kind === "Document") {
    return "Self-disclosed company material. Carries lower verification weight but is critical for capturing the claim language itself and any footnoted qualifications (EU GCD 2024 substantiation check).";
  }
  if (ev.kind === "Linguistic") {
    return "Internal NLP pass over the corpus (EU GCD 2024). Surfaces patterns associated with greenwashing language: maximalist quantifiers, aspirational verbs, undefined nouns. Weight band: 0.30–0.55.";
  }
  return "Contextual evidence supporting the analyst summary above.";
}

export default ReportScreen;
