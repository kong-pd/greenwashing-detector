// ReportScreen.jsx — the hero output: a credibility report on a single claim.
// FR-34: §5 Methodology section shows all 5 standards. Standard badges in §2.
// P2-5: every claim is live — the Petrovera masthead branch is gone.

import { useState, useEffect } from "react";
import {
  riskBand, bandColor,
  ScoreDial, DimensionBars, FlagCard, EvidenceRow, ReportSection,
  StandardBadge, MethodologyPanel,
  DIMENSION_META,
} from "../components/SharedComponents.jsx";
import { gwdToast } from "../toast.js";
import { toHref } from "../utils.js";

// ── Flag → evidence traceability (auditability) ──────────────────────────────
// Resolve which evidence item a flag's `source` string refers to, so clicking
// a flag's SOURCE line opens the Evidence Drawer at that exact item.
// Matching is fuzzy by design — flag sources are free-text AI strings like
// "EU ETS Union Registry 2024; Shell Restated Baseline Memorandum 2023" while
// evidence has structured org/title/url. Token-overlap scoring, best match wins.
// Exported as a pure function so it is unit-testable.
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
  // Require at least two token hits — a single generic word ("report",
  // "database") must not produce a misleading jump.
  return bestScore >= 2 ? best : null;
}

export function ReportScreen({ claim, query, origin = "search", scoreVariant = "arc", onBack, onOpenEvidence }) {
  const [showMeth, setShowMeth] = useState(false);
  const band = riskBand(claim.score);

  // Evidence backing the summary: explicit claim.summaryRefs if authored,
  // otherwise derived from the evidence each flag resolves to (auditable).
  const evidence = claim.evidence ?? [];
  const summaryCites = claim.summaryRefs?.length
    ? claim.summaryRefs.map(id => evidence.find(e => e.id === id)).filter(Boolean)
    : [...new Set((claim.flags ?? []).map(f => findEvidenceForFlag(f, evidence)).filter(Boolean))];

  function handleExportPDF() {
    // P3-11: print CSS hides the collapsed §5 stub, so the full rubric must
    // be mounted before the dialog opens — otherwise the printed report
    // ships with an empty Methodology section.
    setShowMeth(true);
    requestAnimationFrame(() => {
      const prev = document.title;
      document.title = `${claim.headline}_${claim.id}_credibility_report`;
      window.print();
      document.title = prev;
      gwdToast("Print dialog opened — save as PDF", { kind: "ok", icon: "↓" });
    });
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
              {origin === "reports" ? "Reports" : "Search"}
            </button>
            <span className="rep-crumb-sep">/</span>
            <span className="rep-crumb-co mono">{claim.headline}</span>
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

        {/* Degraded-source honesty banner — scraping_snippet_fallback on a
            completed job means the full ESG page was inaccessible and this
            analysis is built from search-result snippets only. */}
        {claim.contentSource === "snippet" && (
          <div
            className="rep-degraded-banner"
            role="status"
            style={{
              display: "flex", alignItems: "baseline", gap: 10,
              padding: "10px 14px", marginBottom: 18,
              border: "1px solid var(--c-warn, #B0741A)",
              borderLeftWidth: 4, borderRadius: "0 6px 6px 0",
              background: "color-mix(in srgb, var(--c-warn, #B0741A) 8%, transparent)",
              fontSize: 13,
            }}
          >
            <span className="mono small" style={{ color: "var(--c-warn, #B0741A)", fontWeight: 600 }}>
              DEGRADED SOURCE
            </span>
            <span>
              {claim.headline}&apos;s full ESG page could not be accessed — this analysis
              is based on search-result snippets. Scores may shift once the full page
              or a pasted report is analysed.
            </span>
          </div>
        )}

        {/* ── Masthead ── */}
        <div className="rep-masthead">
          <div className="rep-mast-kicker mono">
            <span>LIVE ANALYSIS</span>
            <span className="sep">·</span>
            <span>GreenCheck ESG Engine</span>
            <span className="sep">·</span>
            <span>{claim.modelUsed ? `${claim.modelUsed} (layer ${claim.modelLayer})` : "Gemini / Groq"} · rubric v{claim.rubricVersion || "3.2"}</span>
          </div>

          <h1 className="rep-mast-title">{claim.headline}</h1>

          <div className="rep-mast-lede">
            <blockquote>
              <span>{claim.headline} — AI greenwashing risk analysis</span>
            </blockquote>
            <div className="rep-mast-attr mono">
              — GreenCheck live analysis
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
            {summaryCites.length > 0 && (
              <div className="rep-cite-row">
                <span className="rep-cite-lbl mono">BACKED BY</span>
                {summaryCites.map(ev => (
                  <Cite key={ev.id} claim={claim} ev={ev} onOpenEvidence={onOpenEvidence} />
                ))}
              </div>
            )}
            <div className="rep-summary-side">
              <div className="rep-byline mono small mute">
                <div>Prepared by</div>
                <div className="rep-byline-name">GWD Analyzer · {claim.modelUsed ? `${claim.modelUsed} (layer ${claim.modelLayer})` : "Gemini / Groq"}</div>
              </div>
              <div className="rep-byline mono small mute">
                <div>Rubric version</div>
                <div className="rep-byline-name">v{claim.rubricVersion || "3.2"} · 5 dimensions · 0–100</div>
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
            {(claim.flags ?? []).map((f, i) => {
              const match = findEvidenceForFlag(f, evidence);
              return (
                <div key={i} className="rep-flag-item">
                  <FlagCard
                    flag={f}
                    idx={i}
                    onSourceClick={() => {
                      if (match) {
                        onOpenEvidence?.(claim, match);
                      } else if (evidence.length) {
                        onOpenEvidence?.(claim);
                        gwdToast("No exact evidence match — opening full trail", { kind: "info" });
                      } else {
                        gwdToast("No external evidence attached to this report");
                      }
                    }}
                  />
                  {match && (
                    <div className="rep-cite-row rep-cite-row-tight">
                      <span className="rep-cite-lbl mono">SOURCE</span>
                      <Cite claim={claim} ev={match} onOpenEvidence={onOpenEvidence} />
                    </div>
                  )}
                </div>
              );
            })}
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
            <div>GreenCheck · Greenwashing Detection Engine · Evidence-weighted ESG claim analysis</div>
            <div>AI engine: Gemini / Groq · Standards: TCFD · GRI 305 · GRI 2-27 · EU Taxonomy Art. 8 · EU GCD 2024</div>
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
// Inline citation chip: a numbered "[n]" that opens the Evidence Drawer at
// this exact source, matching the number in the evidence trail. Keyboard-ok.
function Cite({ claim, ev, evId, onOpenEvidence }) {
  const list = claim.evidence ?? [];
  const item = ev ?? list.find(e => e.id === evId);
  const [card, setCard] = useState(null); // { x, y, below } | null
  if (!item) return null;
  const n = list.indexOf(item) + 1;
  const open = () => onOpenEvidence?.(claim, item);

  // Position a fixed preview card from the chip’s rect; flip below when near top.
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const below = r.top < 220;
    const x = Math.min(Math.max(r.left + r.width / 2, 168), window.innerWidth - 168);
    setCard({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  const hide = () => setCard(null);

  return (
    <>
      <span
        className="ev-cite"
        role="button"
        tabIndex={0}
        onClick={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      >
        {n}
      </span>
      {card && (
        <div
          className="ev-cite-card"
          role="tooltip"
          style={{ left: card.x, top: card.y, transform: `translate(-50%, ${card.below ? "0" : "-100%"})` }}
        >
          <div className="ev-cite-card-head">
            <span className={"ev-dli-kind k-" + item.kind.toLowerCase()}>{item.kind}</span>
            <span className="mono small mute">{item.id}</span>
          </div>
          <div className="ev-cite-card-title">{item.title}</div>
          <div className="ev-cite-card-meta mono">{item.org} · {item.date}</div>
          <div className="ev-cite-card-quote">“{item.quote}”</div>
          <div className="ev-cite-card-foot mono">CLICK TO OPEN SOURCE →</div>
        </div>
      )}
    </>
  );
}

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
  // P3-14: Escape closes the drawer, matching backdrop click and the ✕.
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Hooks must run unconditionally (rules-of-hooks) — the early return sits
  // below them. `selected` is derived: the user's click sets selectedId; the
  // `ev` prop (flag → evidence jump) wins until the user picks another item,
  // because the prop identity changes reset the local choice via the key check.
  const evidence = claim?.evidence ?? [];
  const [picked, setPicked] = useState(null);   // { forEv, id } — local choice scoped to current ev prop
  const localId = picked && picked.forEv === (ev?.id ?? null) ? picked.id : null;
  const selected =
    (localId && evidence.find(e => e.id === localId)) ||
    ev ||
    evidence[0];

  if (!claim || !selected) return null;

  const href = toHref(selected.url);

  const selectItem = (e) => setPicked({ forEv: ev?.id ?? null, id: e.id });

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
                onClick={() => selectItem(e)}
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
                {href
                  ? <a className="mono ev-detail-url" href={href} target="_blank" rel="noopener noreferrer">{selected.url}</a>
                  : <div className="mono mute">internal analysis — no external source</div>}
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
              <button className="rep-action" onClick={() => {
                if (href) window.open(href, "_blank", "noopener,noreferrer");
                else gwdToast("Internal analyzer evidence — no external source to open");
              }}>
                Open source ↗
              </button>
              <button className="rep-action" onClick={() => {
                navigator.clipboard?.writeText(
                  `${selected.title} (${selected.org}, ${selected.date}). ${href || selected.url}`
                );
                gwdToast("Source citation copied", { kind: "ok" });
              }}>
                Cite this source
              </button>
            </footer>
          </section>
        </div>
      </aside>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// M5: weight breakdown reads the *backend-computed* components when present
// (reliability / recency / relevance stored on each evidence object by the
// analysis service). Falls back to a frontend estimate only for legacy data,
// and says so — each estimated bar is marked "est." for honesty.
// Exported as a pure function so it is unit-testable.
export function weightFactors(ev) {
  const hasISO = typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(ev.date);

  const estReliability =
    ev.kind === "Filing" || ev.kind === "Database" ? 0.92 :
    ev.kind === "Document"   ? 0.78 :
    ev.kind === "News"       ? 0.65 :
    ev.kind === "Linguistic" ? 0.55 : 0.7;
  // Lexicographic date compare is only meaningful for ISO dates — "Unknown"
  // or empty must not be treated as recent ("U" > "2" in ASCII).
  const estRecency = !hasISO ? 0.5
    : ev.date >= "2026-01-01" ? 0.95
    : ev.date >= "2025-01-01" ? 0.78 : 0.55;

  const real = (v) => typeof v === "number" && v >= 0 && v <= 1;

  return [
    { lbl: "Source reliability", v: real(ev.reliability) ? ev.reliability : estReliability,
      est: !real(ev.reliability) },
    { lbl: "Recency",            v: real(ev.recency)     ? ev.recency     : estRecency,
      est: !real(ev.recency) },
    { lbl: "Relevance",          v: real(ev.relevance)   ? ev.relevance   : (ev.weight ?? 0.5),
      est: !real(ev.relevance) },
  ];
}

function WeightBreakdown({ ev }) {
  const factors = weightFactors(ev);
  return (
    <div className="weight-bk">
      {factors.map(f => (
        <div key={f.lbl} className="weight-bk-row">
          <span className="weight-bk-lbl">
            {f.lbl}{f.est && <span className="mono small mute"> · est.</span>}
          </span>
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
