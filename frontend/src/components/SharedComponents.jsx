// SharedComponents.jsx — shared visual atoms for the Greenwashing Detector.
// FR-34: Each scoring dimension now displays its regulatory standard badge.
import { useState, useEffect, useRef, useMemo } from "react";
import { toHref } from "../utils.js";
import { regRefs } from "../regmap.js";

// ───────────────────────────────────────────────────────────── helpers
export function riskBand(score) {
  if (score <= 30) return { key: "low",    label: "Low Risk",    tone: "ok",   range: "0–30"   };
  if (score <= 60) return { key: "medium", label: "Medium Risk", tone: "warn", range: "31–60"  };
  return                  { key: "high",   label: "High Risk",   tone: "bad",  range: "61–100" };
}

export function bandColor(tone) {
  return ({
    ok:   "var(--c-ok)",
    warn: "var(--c-warn)",
    bad:  "var(--c-bad)",
  })[tone] || "var(--c-ink-2)";
}

export function fmt(n, dp = 0) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ───────────────────────────────────────────────────────────── FR-34: Regulatory Standard Badge
// Colour map mirrors the organisations' brand guidelines at accessible contrast levels.
const STANDARD_COLORS = {
  "TCFD":           { bg: "#E8F0FB", text: "#1A56C4", border: "#A8C0EF" },
  "GRI 305":        { bg: "#E6F4EC", text: "#1A7A4A", border: "#90CFA8" },
  "EU Taxonomy":    { bg: "#EAF0FB", text: "#003399", border: "#99B3DD" },
  "GRI 2-27":       { bg: "#E6F4EC", text: "#1A7A4A", border: "#90CFA8" },
  "EU GCD 2024":    { bg: "#FFF3E0", text: "#B45309", border: "#F0C97A" },
};

export function StandardBadge({ standard, compact = false }) {
  const colors = STANDARD_COLORS[standard] || { bg: "var(--c-bg-2)", text: "var(--c-ink-2)", border: "var(--c-line)" };
  return (
    <span
      className={"std-badge" + (compact ? " compact" : "")}
      style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
      title={`Scored against ${standard}`}
    >
      {standard}
    </span>
  );
}

// ───────────────────────────────────────────────────────────── DIMENSION_META
// FR-34: Each dimension now carries its regulatory standard reference.
export const DIMENSION_META = [
  {
    key: "specificity",
    label: "Claim Specificity",
    gloss: "Time-bound, quantifiable targets vs. slogans. Are interim milestones disclosed?",
    standard: "TCFD",
    standardFull: "Task Force on Climate-related Financial Disclosures",
    rubric: { low: "Clear, time-bound targets with baselines", mid: "Goals stated but vague, no timeline", high: "Slogans only — 'committed to', 'striving for'" },
  },
  {
    key: "data_consistency",
    label: "Data Consistency",
    gloss: "Alignment with CDP, EU ETS, OGMP 2.0, MethaneSAT and other verified databases.",
    standard: "GRI 305",
    standardFull: "GRI 305: Emissions — cross-verification methodology",
    rubric: { low: "Claims align with verified external data", mid: "Minor discrepancies or unverifiable claims", high: "Claims directly contradict verified data" },
  },
  {
    key: "third_party_certification",
    label: "Third-Party Verification",
    gloss: "Independent assurance: SBTi, B Corp, ISCC, CDP A-list, RE100, OGMP Gold Pathway.",
    standard: "EU Taxonomy",
    standardFull: "EU Taxonomy Regulation — Art. 8 disclosure requirements",
    rubric: { low: "Multiple credible independent certifications", mid: "Single or low-credibility certification", high: "No independent verification of any kind" },
  },
  {
    key: "negative_news",
    label: "Negative News",
    gloss: "Media coverage, regulatory investigations, litigation, activist campaigns.",
    standard: "GRI 2-27",
    standardFull: "GRI 2-27: Compliance with laws and regulations",
    rubric: { low: "No negative coverage or regulatory action", mid: "Minor controversy, no formal action", high: "Active regulatory investigation or major scandal" },
  },
  {
    key: "greenwashing_language",
    label: "Greenwashing Language",
    gloss: "Undefined superlatives, aspirational verbs, buzzwords without data support.",
    standard: "EU GCD 2024",
    standardFull: "EU Green Claims Directive 2024 — substantiation requirements",
    rubric: { low: "Precise language backed by specific data", mid: "Some aspirational verbs alongside data", high: "Heavy 'committed to', 'net-positive', 'green future' with no data" },
  },
];

// ───────────────────────────────────────────────────────────── ScoreDial
export function ScoreDial({ score, variant = "arc", size = 240, label = "Greenwashing Risk" }) {
  const band = riskBand(score);

  if (variant === "letter") {
    const letter =
      score <= 15 ? "AAA" :
      score <= 30 ? "AA"  :
      score <= 45 ? "A"   :
      score <= 60 ? "BBB" :
      score <= 75 ? "BB"  :
      score <= 90 ? "B"   :
                    "D";
    return (
      <div className="score-letter" style={{ width: size, height: size }}>
        <div className="score-letter-grade" style={{ color: bandColor(band.tone) }}>{letter}</div>
        <div className="score-letter-meta">
          <span className="num">{score}</span>
          <span className="dot">·</span>
          <span>{band.label}</span>
        </div>
        <div className="score-letter-rail">
          {["AAA","AA","A","BBB","BB","B","D"].map((g) => (
            <span key={g} className={"rail-tick" + (g === letter ? " on" : "")}>{g}</span>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "bar") {
    const pct = Math.max(0, Math.min(100, score));
    return (
      <div className="score-bar" style={{ width: size * 1.8 }}>
        <div className="score-bar-head">
          <div className="score-bar-num" style={{ color: bandColor(band.tone) }}>{score}</div>
          <div className="score-bar-meta">
            <div className="score-bar-band" style={{ color: bandColor(band.tone) }}>{band.label}</div>
            <div className="score-bar-sub">Greenwashing Risk Index · 0–100 scale</div>
          </div>
        </div>
        <div className="score-bar-rail">
          <div className="score-bar-zone z-ok"   style={{ width: "30%" }}></div>
          <div className="score-bar-zone z-warn" style={{ width: "30%" }}></div>
          <div className="score-bar-zone z-bad"  style={{ width: "40%" }}></div>
          <div className="score-bar-needle" style={{ left: pct + "%" }}>
            <div className="score-bar-needle-stem"></div>
            <div className="score-bar-needle-cap"></div>
          </div>
        </div>
        <div className="score-bar-ticks">
          <span>0</span>
          <span style={{ left: "30%" }}>30</span>
          <span style={{ left: "60%" }}>60</span>
          <span style={{ right: 0 }}>100</span>
        </div>
      </div>
    );
  }

  // arc — semicircular gauge
  const R = size * 0.42;
  const cx = size / 2;
  const cy = size * 0.62;
  const toPt = (pct) => {
    const a = Math.PI - (pct / 100) * Math.PI;
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const segArc = (from, to, color) => {
    const [x1, y1] = toPt(from);
    const [x2, y2] = toPt(to);
    const large = (to - from) > 50 ? 1 : 0;
    return <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`} stroke={color} strokeWidth={size * 0.05} fill="none" strokeLinecap="butt" />;
  };
  const [nx, ny] = toPt(score);

  return (
    <div className="score-arc" style={{ width: size, height: size * 0.78 }}>
      <svg viewBox={`0 0 ${size} ${size * 0.78}`} width="100%" height="100%">
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
              stroke="var(--c-line)" strokeWidth={size * 0.05} fill="none" />
        {segArc(0, 30,  "color-mix(in oklch, var(--c-ok) 35%, transparent)")}
        {segArc(30, 60, "color-mix(in oklch, var(--c-warn) 35%, transparent)")}
        {segArc(60, 100, "color-mix(in oklch, var(--c-bad) 35%, transparent)")}
        {segArc(0, score, bandColor(band.tone))}
        {[30, 60].map((p) => {
          const [x, y] = toPt(p);
          const [xi, yi] = [cx + (R - size * 0.06) * Math.cos(Math.PI - (p / 100) * Math.PI),
                             cy - (R - size * 0.06) * Math.sin(Math.PI - (p / 100) * Math.PI)];
          return <line key={p} x1={x} y1={y} x2={xi} y2={yi} stroke="var(--c-ink-0)" strokeWidth="1" opacity=".25" />;
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--c-ink-0)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={size * 0.025} fill="var(--c-ink-0)" />
      </svg>
      <div className="score-arc-num" style={{ color: bandColor(band.tone) }}>{score}</div>
      <div className="score-arc-meta">
        <span style={{ color: bandColor(band.tone) }}>● {band.label}</span>
        <span className="score-arc-out">/ 100</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── RiskPill
export function RiskPill({ score, compact = false }) {
  const band = riskBand(score);
  return (
    <span className={"risk-pill r-" + band.tone + (compact ? " compact" : "")}>
      <span className="risk-pill-dot"></span>
      <span className="risk-pill-num">{score}</span>
      {!compact && <span className="risk-pill-label">{band.label}</span>}
    </span>
  );
}

// ───────────────────────────────────────────────────────────── DimensionBars
// FR-34: Shows regulatory standard badge per dimension when not in dense mode.
export function DimensionBars({ scores, max = 20, dense = false }) {
  const [tooltip, setTooltip] = useState(null);

  return (
    <div className={"dim-bars" + (dense ? " dense" : "")}>
      {DIMENSION_META.map((d) => {
        const v = scores[d.key] ?? 0;
        const pct = (v / max) * 100;
        const tone = v >= 14 ? "bad" : v >= 8 ? "warn" : "ok";
        const riskWord = v >= 14 ? d.rubric.high : v >= 8 ? d.rubric.mid : d.rubric.low;

        return (
          <div className="dim-row" key={d.key}>
            <div className="dim-row-l">
              <div className="dim-label-row">
                <div className="dim-label">{d.label}</div>
                {/* FR-34: Regulatory standard badge */}
                {!dense && (
                  <StandardBadge standard={d.standard} compact />
                )}
              </div>
              {!dense && (
                <>
                  <div className="dim-gloss">{d.gloss}</div>
                  <div className="dim-rubric-hint mono small mute">
                    {v >= 14 ? "▲ HIGH — " : v >= 8 ? "◆ MED — " : "✓ LOW — "}
                    {riskWord}
                  </div>
                </>
              )}
            </div>
            <div className="dim-row-r">
              <div className="dim-rail">
                <div className={"dim-fill t-" + tone} style={{ width: pct + "%" }}></div>
                <div className="dim-tick" style={{ left: "40%" }}></div>
                <div className="dim-tick" style={{ left: "70%" }}></div>
              </div>
              <div className="dim-value" style={{ color: bandColor(tone) }}>
                <span className="mono">{v}</span>
                <span className="dim-value-max">/{max}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── EvidenceRow
export function EvidenceRow({ ev, index, onOpen }) {
  const w = Math.round(ev.weight * 100);
  const href = toHref(ev.url);
  const num = String(index + 1).padStart(2, "0");
  return (
    <div className="ev-row" onClick={() => onOpen?.(ev)}>
      {href
        ? <a
            className="ev-num mono"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title="Open source ↗"
            aria-label={`Open source for evidence ${num}${ev.org ? " · " + ev.org : ""}`}
            onClick={(e) => e.stopPropagation()}
          >{num}</a>
        : <div className="ev-num mono is-internal" title="Internal analysis — no external source">{num}</div>}
      <div className="ev-body">
        <div className="ev-head">
          <span className={"ev-kind k-" + ev.kind.toLowerCase()}>{ev.kind}</span>
          <span className="ev-title">{ev.title}</span>
        </div>
        <div className="ev-quote">&ldquo;{ev.quote}&rdquo;</div>
        <div className="ev-meta mono">
          <span>{ev.org}</span>
          <span className="sep">·</span>
          <span>{ev.date}</span>
          <span className="sep">·</span>
          {href
            ? <a
                className="ev-url"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >{ev.url}</a>
            : <span className="ev-url is-internal">internal analysis</span>}
        </div>
      </div>
      <div className="ev-weight">
        <div className="ev-weight-bar">
          <div className="ev-weight-fill" style={{ width: w + "%" }}></div>
        </div>
        <div className="ev-weight-val mono">{w}</div>
        <div className="ev-weight-cap">weight</div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── RegChips
// PROD-2: the regulation clauses a compliance reader would check first
// for this flag type. Chip shows the short code; the full regulation name
// travels as the tooltip. Unknown type → renders nothing (regmap returns
// [] rather than inventing a citation).
export function RegChips({ type }) {
  const refs = regRefs(type);
  if (!refs.length) return null;
  return (
    <span className="reg-chips">
      {refs.map(r => (
        <span key={r.short} className="reg-chip mono" title={`${r.reg} — ${r.ref}`}>
          {r.short}
        </span>
      ))}
    </span>
  );
}

// ───────────────────────────────────────────────────────────── FlagCard
export function FlagCard({ flag, idx, onSourceClick }) {
  const sev = flag.severity || "medium";
  return (
    <div className={"flag-card sv-" + sev}>
      <div className="flag-card-head">
        <span className="flag-card-num mono">F-{String(idx + 1).padStart(2, "0")}</span>
        <span className="flag-card-type">{flag.type}</span>
        <span className={"flag-card-sev sv-" + sev}>
          <span className="flag-card-sev-dot"></span>{sev.toUpperCase()}
        </span>
      </div>
      <div className="flag-card-desc">{flag.description}</div>
      <RegChips type={flag.type} />
      {onSourceClick ? (
        // Auditability: clicking the source line opens the Evidence Drawer at
        // the matching evidence item (flag → evidence traceability).
        <button
          type="button"
          className="flag-card-src mono"
          onClick={onSourceClick}
          title="Open this source in the evidence trail"
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            textAlign: "left", width: "100%", font: "inherit", color: "inherit",
            textDecoration: "underline", textDecorationStyle: "dotted",
            textUnderlineOffset: 3,
          }}
        >
          <span className="flag-card-src-lbl">SOURCE</span> {flag.source} →
        </button>
      ) : (
        <div className="flag-card-src mono">
          <span className="flag-card-src-lbl">SOURCE</span> {flag.source}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Misc
export function Pill({ children, tone = "neutral", compact = false }) {
  return <span className={"pill p-" + tone + (compact ? " compact" : "")}>{children}</span>;
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

export function Sparkline({ values, width = 80, height = 18, color = "var(--c-ink-1)" }) {
  if (!values || !values.length) return null;
  const mn = Math.min(...values), mx = Math.max(...values);
  const r = mx - mn || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - mn) / r) * (height - 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="sparkline">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  );
}

// Section heading used inside the Report — newspaper-style with rule
export function ReportSection({ kicker, title, children, right }) {
  return (
    <section className="rep-section">
      <header className="rep-section-head">
        <div className="rep-section-l">
          {kicker && <div className="rep-kicker mono">{kicker}</div>}
          <h3 className="rep-section-title">{title}</h3>
        </div>
        {right && <div className="rep-section-r">{right}</div>}
      </header>
      <div className="rep-section-body">{children}</div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── MethodologyPanel
// FR-34: Displays the full 5-dimension rubric with standard references in a table.
export function MethodologyPanel() {
  return (
    <div className="meth-panel">
      <div className="meth-intro">
        <p>
          Each claim is scored across five dimensions (0–20 per dimension, 0–100 total)
          aligned to internationally recognised ESG disclosure standards.
          AI analysis uses a versioned rubric across the configured Gemini, Groq, and optional Claude fallback chain;
          all weights are post-processed through deterministic clamping bands.
        </p>
      </div>
      <table className="meth-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Dimension</th>
            <th>Standard</th>
            <th>0 — Low risk</th>
            <th>10 — Medium risk</th>
            <th>20 — High risk</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSION_META.map((d, i) => (
            <tr key={d.key}>
              <td className="mono mute">{i + 1}</td>
              <td>
                <div className="meth-dim-name">{d.label}</div>
                <div className="meth-dim-gloss">{d.gloss}</div>
              </td>
              <td>
                <StandardBadge standard={d.standard} />
                <div className="meth-std-full">{d.standardFull}</div>
              </td>
              <td className="meth-cell ok">{d.rubric.low}</td>
              <td className="meth-cell warn">{d.rubric.mid}</td>
              <td className="meth-cell bad">{d.rubric.high}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="meth-footer mono small mute">
        Evidence weights are clamped to kind-specific bands:
        Filing 0.85–0.95 · Database 0.80–0.92 · News 0.40–0.80 · Document 0.45–0.65 · Linguistic 0.30–0.55
      </div>
    </div>
  );
}
