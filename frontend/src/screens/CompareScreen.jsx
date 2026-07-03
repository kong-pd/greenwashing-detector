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
import { DIMENSION_META, RiskPill, RegChips } from "../components/SharedComponents.jsx";

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

/**
 * PROD-3 — flag-level change between two runs of the SAME company.
 * Identity is the flag TYPE; buckets carry the objects from the side that
 * owns the narrative: `added`/`kept` from the newer run, `resolved` from
 * the older. Input order preserved within each bucket; inputs untouched.
 */
export function diffFlags(olderFlags, newerFlags) {
  const older = Array.isArray(olderFlags) ? olderFlags : [];
  const newer = Array.isArray(newerFlags) ? newerFlags : [];
  const oldTypes = new Set(older.map(f => f.type));
  const newTypes = new Set(newer.map(f => f.type));
  return {
    added:    newer.filter(f => !oldTypes.has(f.type)),
    resolved: older.filter(f => !newTypes.has(f.type)),
    kept:     newer.filter(f => oldTypes.has(f.type)),
  };
}

const sameCo = (x, y) => {
  const nx = (x || "").trim().toLowerCase();
  return nx !== "" && nx === (y || "").trim().toLowerCase();
};

// ── Screen ───────────────────────────────────────────────────────────────────

const DIM_MAX = 20;
const tone = v => (v >= 14 ? "bad" : v >= 8 ? "warn" : "ok");

export function CompareScreen({ rows, makeClaim, onBack }) {
  const [state, setState] = useState({ loading: true, error: false, pairs: [] });

  useEffect(() => {
    let alive = true;
    Promise.all(
      rows.map(async r => {
        const raw = await getReport(r.job_id);
        return { row: r, rep: normalise(raw, makeClaim(r.company_name || "Unknown")) };
      })
    )
      .then(pairs => {
        if (!alive) return;
        if (pairs.length !== 2 || pairs.some(p => !p.rep)) {
          setState({ loading: false, error: true, pairs: [] });
          return;
        }
        // PROD-3: two runs of the SAME company are a before/after, not an
        // A/B — order them in time so the earlier run always reads left.
        const same = sameCo(
          pairs[0].rep.company_name || pairs[0].rep.headline,
          pairs[1].rep.company_name || pairs[1].rep.headline,
        );
        const ordered = same
          ? [...pairs].sort((x, y) =>
              (x.row.completed_at || "") < (y.row.completed_at || "") ? -1 : 1)
          : pairs;
        setState({ loading: false, error: false, pairs: ordered });
      })
      .catch(() => alive && setState({ loading: false, error: true, pairs: [] }));
    return () => { alive = false; };
    // rows are fixed for this route's lifetime — a new comparison is a new route.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pa, pb] = state.pairs;
  const a = pa?.rep, b = pb?.rep;
  const same = a && b && sameCo(a.company_name || a.headline,
                                b.company_name || b.headline);
  const delta = same ? (b.score ?? 0) - (a.score ?? 0) : 0;

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
          {/* PROD-3: two runs of the same company are a before/after — the
              banner names the mode and carries the honest delta (▲ worse,
              ▼ better, ± 0 when nothing moved — never an invented change). */}
          {same && (
            <div className="cmp-same">
              <span className="cmp-same-lbl mono small">SAME COMPANY · TWO RUNS</span>
              <span className="cmp-same-delta mono"
                data-dir={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
                {a.score ?? 0} → {b.score ?? 0}{" "}
                ({delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "± 0"})
              </span>
            </div>
          )}

          <div className="cmp-grid">
            {state.pairs.map(({ row, rep }, i) => (
              <section className="cmp-col" key={row.job_id}>
                {same && (
                  <div className="cmp-run-tag mono small mute">
                    {i === 0 ? "earlier" : "latest"} · {(row.completed_at || "").slice(0, 10)}
                  </div>
                )}
                <h2 className="cmp-co">{rep.company_name || rep.headline}</h2>
                <RiskPill score={rep.score ?? 0} />
                <div className="cmp-flags">
                  <div className="cmp-flags-lbl mono small mute">TOP FINDINGS</div>
                  {topFlags(rep.flags).length === 0 ? (
                    <p className="small mute" style={{ margin: "8px 0 0" }}>
                      No flags on this report.
                    </p>
                  ) : (
                    topFlags(rep.flags).map((f, j) => (
                      <div className="cmp-flag" key={j} data-sev={f.severity || "medium"}>
                        <div className="cmp-flag-type small">
                          <span className="cmp-flag-dot" />
                          {f.type}
                        </div>
                        <p className="cmp-flag-desc small mute">{f.description}</p>
                        <RegChips type={f.type} />
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>

          {/* PROD-3: the flag-level change narrative — what a new run added
              or resolved relative to the earlier one. Identical runs say so
              plainly instead of inventing movement. */}
          {same && (() => {
            const d = diffFlags(a.flags, b.flags);
            return (
              <div className="cmp-diff">
                <div className="cmp-flags-lbl mono small mute">CHANGE SINCE EARLIER RUN</div>
                {d.added.length === 0 && d.resolved.length === 0 ? (
                  <p className="small mute" style={{ margin: "6px 0 0" }}>
                    No flag changes between runs.
                  </p>
                ) : (
                  <>
                    {d.added.map(f => (
                      <div className="cmp-diff-row" data-kind="added" key={"a-" + f.type}>
                        <span className="cmp-diff-mark mono small">▲ NEW</span>
                        <span className="cmp-diff-type small">{f.type}</span>
                        <RegChips type={f.type} />
                      </div>
                    ))}
                    {d.resolved.map(f => (
                      <div className="cmp-diff-row" data-kind="resolved" key={"r-" + f.type}>
                        <span className="cmp-diff-mark mono small">▼ RESOLVED</span>
                        <span className="cmp-diff-type small">{f.type}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })()}

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
