// SharedComponents.jsx — shared visual atoms for the Greenwashing Detector.
import { useState, useEffect, useRef, useMemo } from "react";

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
export const DIMENSION_META = [
  { key: "specificity",               label: "Claim Specificity",        gloss: "Time-bound, quantifiable targets vs. slogans." },
  { key: "data_consistency",          label: "Data Consistency",         gloss: "Alignment with external databases (EU ETS, CDP, OGMP)." },
  { key: "third_party_certification", label: "Third-Party Verification", gloss: "Independent assurance, ratings, audits." },
  { key: "negative_news",             label: "Negative News",            gloss: "Media coverage, regulatory action, controversy." },
  { key: "greenwashing_language",     label: "Greenwashing Language",    gloss: "Aspirational verbs, undefined superlatives, buzzwords." },
];

export function DimensionBars({ scores, max = 20, dense = false }) {
  return (
    <div className={"dim-bars" + (dense ? " dense" : "")}>
      {DIMENSION_META.map((d) => {
        const v = scores[d.key] ?? 0;
        const pct = (v / max) * 100;
        const tone = v >= 14 ? "bad" : v >= 8 ? "warn" : "ok";
        return (
          <div className="dim-row" key={d.key}>
            <div className="dim-row-l">
              <div className="dim-label">{d.label}</div>
              {!dense && <div className="dim-gloss">{d.gloss}</div>}
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
  return (
    <div className="ev-row" onClick={() => onOpen?.(ev)}>
      <div className="ev-num mono">{String(index + 1).padStart(2, "0")}</div>
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
          <span className="ev-url">{ev.url}</span>
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

// ───────────────────────────────────────────────────────────── FlagCard
export function FlagCard({ flag, idx }) {
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
      <div className="flag-card-src mono">
        <span className="flag-card-src-lbl">SOURCE</span> {flag.source}
      </div>
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
