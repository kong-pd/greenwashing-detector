// CompareScreen — two COMPLETED analyses side by side (PROD-1 L2).
//
// The rows arriving here are thin history summaries; this screen is a
// C-2-disciplined consumer: it fetches BOTH full records through the real
// GET /api/report/{job_id} (DB first, NFR-09 relay fallback) and renders
// nothing it didn't receive. Either fetch failing → one honest error state,
// never a half-populated comparison.
import React, { useState, useEffect } from "react";
import { getReport } from "../api/client.js";
import { normalise } from "./AnalysisScreen.jsx";
import { DIMENSION_META, RiskPill } from "../components/SharedComponents.jsx";

// ── Pure seams (vitest-covered) ──────────────────────────────────────────────

/**
 * The Reports-list pick queue. Cap 2; identity by job_id.
 *   * picking a selected row deselects it;
 *   * a third pick swaps out the OLDEST selection — no dead click, no
 *     scolding toast, the queue just moves on;
 *   * never mutates its input.
 */
export function toggleSelection(sel, row) {
  const current = Array.isArray(sel) ? sel : [];
  // No identity → not selectable. Without this, undefined === undefined
  // makes two DIFFERENT id-less rows toggle each other off, which the UI
  // reads as "single-select only". Merge/relay rows always carry job_id;
  // this guards injected or legacy payloads.
  if (!row?.job_id) return current;
  if (current.some(r => r.job_id === row.job_id)) {
    return current.filter(r => r.job_id !== row.job_id);
  }
  return [...current, row].slice(-2);
}

const SEV_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Severity-ranked top-N flags for one side of the comparison. Missing
 * severity defaults to "medium" (the backend normaliser's convention), so
 * legacy payloads never sink below rated ones. Stable within a severity.
 */
export function topFlags(flags, n = 3) {
  if (!Array.isArray(flags)) return [];
  return flags
    .map((f, i) => ({ f, i, rank: SEV_RANK[f?.severity] ?? SEV_RANK.medium }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, n)
    .map(x => x.f);
}

// ── Screen ───────────────────────────────────────────────────────────────────

const DIM_MAX = 20;
const tone = v => (v >= 14 ? "bad" : v >= 8 ? "warn" : "ok");

export function CompareScreen({ rows, makeClaim, onBack }) {
  const [state, setState] = useState({ loading: true, error: false, reports: [] });

  useEffect(() => {
    let alive = true;
    Promise.all(
      rows.map(async r => {
        const raw = await getReport(r.job_id);
        return normalise(raw, makeClaim(r.company_name || "Unknown"));
      })
    )
      .then(reports => {
        if (!alive) return;
        if (reports.length !== 2 || reports.some(x => !x)) {
          setState({ loading: false, error: true, reports: [] });
        } else {
          setState({ loading: false, error: false, reports });
        }
      })
      .catch(() => alive && setState({ loading: false, error: true, reports: [] }));
    return () => { alive = false; };
    // rows are fixed for this route's lifetime — a new comparison is a new route.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [a, b] = state.reports;

  return (
    <div className="screen cmp-screen">
      <button className="cmp-back mono small mute" onClick={onBack}>← Reports</button>

      <header className="wl-head">
        <div>
          <div className="co-card-kicker mono small">SIDE BY SIDE</div>
          <h1 className="co-head-title">Comparison</h1>
        </div>
      </header>

      {state.loading ? (
        <div className="mono small mute" style={{ padding: "48px 4px" }}>
          Loading comparison<span className="dots"><span/><span/><span/></span>
        </div>
      ) : state.error ? (
        <div className="cmp-error">
          <div className="mono small" style={{ letterSpacing: ".06em", marginBottom: 6 }}>
            COMPARISON UNAVAILABLE
          </div>
          <p className="small mute" style={{ margin: 0 }}>
            Couldn't load one of the reports — it may have expired. Go back
            and pick two completed analyses.
          </p>
        </div>
      ) : (
        <>
          <div className="cmp-grid">
            {[a, b].map(rep => (
              <section className="cmp-col" key={rep.job_id || rep.headline}>
                <h2 className="cmp-co">{rep.company_name || rep.headline}</h2>
                <RiskPill score={rep.score ?? 0} />
                <div className="cmp-flags">
                  <div className="cmp-flags-lbl mono small mute">TOP FINDINGS</div>
                  {topFlags(rep.flags).length === 0 ? (
                    <p className="small mute" style={{ margin: "8px 0 0" }}>
                      No flags on this report.
                    </p>
                  ) : (
                    topFlags(rep.flags).map((f, i) => (
                      <div className="cmp-flag" key={i} data-sev={f.severity || "medium"}>
                        <div className="cmp-flag-type small">
                          <span className="cmp-flag-dot" />
                          {f.type}
                        </div>
                        <p className="cmp-flag-desc small mute">{f.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>

          {/* Mirrored dimension bars — the two sides grow toward each other
              from the shared label spine, so a longer bar reads as "worse"
              on BOTH sides without a legend lookup. */}
          <div className="cmp-dims">
            <div className="cmp-dims-legend mono small mute">
              <span className="cmp-legend-a">{a.company_name || a.headline}</span>
              <span />
              <span className="cmp-legend-b">{b.company_name || b.headline}</span>
            </div>
            {DIMENSION_META.map(d => {
              const va = a.dimensionScores?.[d.key] ?? 0;
              const vb = b.dimensionScores?.[d.key] ?? 0;
              return (
                <div className="cmp-dim-row" key={d.key}>
                  <span className="cmp-dim-val mono" data-tone={tone(va)}>{va}</span>
                  <div className="cmp-dim-bar left">
                    <div className="cmp-dim-fill" data-tone={tone(va)}
                      style={{ width: `${(va / DIM_MAX) * 100}%` }} />
                  </div>
                  <span className="cmp-dim-label small">{d.label}</span>
                  <div className="cmp-dim-bar">
                    <div className="cmp-dim-fill" data-tone={tone(vb)}
                      style={{ width: `${(vb / DIM_MAX) * 100}%` }} />
                  </div>
                  <span className="cmp-dim-val mono right" data-tone={tone(vb)}>{vb}</span>
                </div>
              );
            })}
            <p className="cmp-dims-note mono small mute">
              0–{DIM_MAX} per dimension · higher = more greenwashing risk
            </p>
          </div>
        </>
      )}
    </div>
  );
}
