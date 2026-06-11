// Interactions.jsx — Toaster, CommandPalette, NotificationsMenu, UserMenu, SettingsSheet
import { useState, useEffect, useRef, useMemo } from "react";
import { gwdToast, subscribeToast } from "../toast.js";
import { GWD_DATA } from "../data.js";

export { gwdToast };

// ───────────────────────────────────────────────────── Toast system
export function Toaster() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    return subscribeToast((t) => {
      setToasts((arr) => [...arr, t]);
      setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== t.id)), t.ttl);
    });
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={"toast k-" + t.kind}>
          <span className="toast-icon">
            {t.icon ?? (t.kind === "ok" ? "✓" : t.kind === "warn" ? "▲" : "›")}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────── Dropdown wrapper
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

// ───────────────────────────────────────────────────── Notifications
const NOTIFS = [
  {
    id: 1, tone: "bad", kicker: "REGULATORY",
    title: "Petrovera SAF claim — ACM investigation update",
    body: "Dutch Authority for Consumers and Markets posted a status note. Risk on CLM-2026-0331-D may rise.",
    time: "3m",
  },
  {
    id: 2, tone: "warn", kicker: "RISK CHANGE",
    title: "Halicombe Air ↑ 9 to 81",
    body: "Aggregate greenwashing risk crossed the High band after Q1 disclosure.",
    time: "42m",
  },
  {
    id: 3, tone: "ok", kicker: "SOURCE",
    title: "MethaneSAT Q1 2026 dataset published",
    body: "New evidence available for 2 watchlist companies. Re-analysis recommended.",
    time: "2h",
  },
  {
    id: 4, tone: "info", kicker: "DIGEST",
    title: "Weekly portfolio digest ready",
    body: "10 companies · 3 score changes · 1 new flag of high severity.",
    time: "yesterday",
  },
];

export function NotificationsMenu() {
  const d = useDropdown();
  return (
    <div className="dropdown-wrap" ref={d.ref}>
      <button className="icon-btn" title="Notifications" onClick={() => d.setOpen(!d.open)}>
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M8 2 C5.5 2 4 4 4 6.5 V9 L3 11 H13 L12 9 V6.5 C12 4 10.5 2 8 2 Z M6.5 12 C6.5 13 7.2 13.5 8 13.5 C8.8 13.5 9.5 13 9.5 12"
                stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
        </svg>
        <span className="icon-btn-dot"></span>
      </button>
      {d.open && (
        <div className="dropdown notif-menu" role="menu">
          <header className="dd-head">
            <div>
              <div className="mono small mute" style={{ letterSpacing: ".06em" }}>NOTIFICATIONS</div>
              <div className="dd-head-title">{NOTIFS.length} new signals</div>
            </div>
            <button className="dd-link mono small">Mark all read</button>
          </header>
          <ul className="notif-list">
            {NOTIFS.map((n) => (
              <li key={n.id} className={"notif-row t-" + n.tone}>
                <span className="notif-dot"></span>
                <div className="notif-body">
                  <div className="notif-kicker mono small">{n.kicker} · {n.time}</div>
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-text">{n.body}</div>
                </div>
              </li>
            ))}
          </ul>
          <footer className="dd-foot">
            <button className="dd-link mono small" onClick={() => { d.setOpen(false); gwdToast("Opened notification center"); }}>
              Open all →
            </button>
            <button className="dd-link mono small" onClick={() => { d.setOpen(false); gwdToast("Alert rules updated"); }}>
              Alert rules
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────── User menu (identity only)
export function UserMenu() {
  const d = useDropdown();
  return (
    <div className="dropdown-wrap" ref={d.ref}>
      <button className="top-user" onClick={() => d.setOpen(!d.open)} title="Account">
        <div className="top-user-av">
          <svg viewBox="0 0 16 16" width="13" height="13">
            <circle cx="8" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.3" fill="none"/>
            <path d="M3 13.5 C3.6 11 5.5 10 8 10 C10.5 10 12.4 11 13 13.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="top-user-info">
          <div className="top-user-name">Guest</div>
          <div className="top-user-org mono small mute">sandbox</div>
        </div>
        <svg viewBox="0 0 10 6" width="8" height="6" className="top-user-caret">
          <path d="M0 1 L5 5 L10 1" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {d.open && (
        <div className="dropdown user-menu" role="menu">
          <div className="user-menu-card">
            <div className="user-menu-av">
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M3 18 C4 14.5 6.5 13 10 13 C13.5 13 16 14.5 17 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="user-menu-name">Guest session</div>
            </div>
          </div>
          <div className="user-menu-section">
            <div className="user-menu-item disabled">
              <span className="user-menu-ico">
                <svg viewBox="0 0 14 14" width="12" height="12" fill="none"><path d="M7 1v6M7 10v1M4 3.27A5 5 0 1 0 10 3.27" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </span>
              <span>Sign in</span>
              <span className="user-menu-badge mono">coming soon</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────── Command Palette (⌘K)
export function CommandPalette({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef(null);
  const bodyRef  = useRef(null);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 30); setQ(""); setSelIdx(0); }
  }, [open]);

  // ── search across companies, claims, actions ──────────────────────────────
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();

    // fuzzy-ish: every word in query must appear somewhere in the target
    function fuzzy(target, query) {
      if (!query) return true;
      const words = query.split(/\s+/);
      return words.every(w => target.includes(w));
    }

    const companies = GWD_DATA.WATCHLIST.filter((c) =>
      fuzzy(c.name.toLowerCase() + " " + c.ticker.toLowerCase() + " " + c.sector.toLowerCase(), ql)
    ).slice(0, 5);

    const claims = GWD_DATA.CLAIMS.filter((cl) =>
      fuzzy(
        cl.headline.toLowerCase() + " " + cl.shortQuote.toLowerCase() +
        " " + cl.id.toLowerCase() + " " + cl.riskLevel.toLowerCase(),
        ql
      )
    ).slice(0, 4);

    const ALL_ACTIONS = [
      { id: "act-new",    label: "Start new analysis",     hint: "Paste a claim or upload a report",  kind: "action" },
      { id: "act-export", label: "Export current report",  hint: "PDF · institutional layout",        kind: "action" },
      { id: "act-tweaks", label: "Toggle Tweaks panel",    hint: "Palette · score style · density",   kind: "action" },
      { id: "act-help",   label: "How the rubric works",   hint: "Five dimensions · 0–100 scale",     kind: "action" },
    ];
    const actions = ALL_ACTIONS.filter((a) =>
      fuzzy(a.label.toLowerCase() + " " + a.hint.toLowerCase(), ql)
    );

    return [
      { title: "Companies", kind: "company", items: companies },
      { title: "Claims",    kind: "claim",   items: claims    },
      { title: "Actions",   kind: "action",  items: actions   },
    ].filter((g) => g.items.length);
  }, [q]);

  // flat list for keyboard navigation
  const flatItems = useMemo(() =>
    groups.flatMap(g => g.items.map(it => ({ ...it, _kind: g.kind }))),
  [groups]);

  // clamp selection when results change
  useEffect(() => {
    setSelIdx(i => Math.min(i, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // scroll selected item into view
  useEffect(() => {
    const el = bodyRef.current?.querySelector(`[data-cmd-idx="${selIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  // keyboard handler
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(i => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && flatItems[selIdx]) {
        const it = flatItems[selIdx];
        onPick?.(it._kind, it);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, flatItems, selIdx]);

  if (!open) return null;

  // build global index counter across groups
  let gIdx = 0;

  return (
    <div className="cmd-wrap" onClick={(e) => { if (e.target.classList.contains("cmd-wrap")) onClose(); }}>
      <div className="cmd" role="dialog" aria-label="Command palette">
        <header className="cmd-head">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelIdx(0); }}
            placeholder="Search companies, claims, actions…"
          />
          {q && (
            <button className="cmd-clear" onClick={() => { setQ(""); setSelIdx(0); inputRef.current?.focus(); }}>
              <svg viewBox="0 0 12 12" width="9" height="9"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
          <span className="cmd-kbd mono">ESC</span>
        </header>

        <div className="cmd-body" ref={bodyRef}>
          {groups.length === 0 && (
            <div className="cmd-empty">
              <div className="cmd-empty-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M17 17L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M9 11h4M11 9v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="cmd-empty-title">
                {q ? <>No results for <em>"{q}"</em></> : "Start typing to search…"}
              </div>
              {q && (
                <div className="cmd-empty-hint mono small mute">
                  Sandbox contains: Petrovera Global · 8 claims · {GWD_DATA.WATCHLIST.length} watchlist companies
                </div>
              )}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.title} className="cmd-group">
              <div className="cmd-group-title mono">{g.title}</div>
              {g.items.map((it) => {
                const myIdx = gIdx++;
                const isSel = myIdx === selIdx;
                return (
                  <button
                    key={it.id ?? it.ticker}
                    data-cmd-idx={myIdx}
                    className={"cmd-row" + (isSel ? " sel" : "")}
                    onMouseEnter={() => setSelIdx(myIdx)}
                    onClick={() => { onPick?.(g.kind, it); onClose(); }}
                  >
                    <span className={"cmd-row-kind k-" + g.kind}>
                      {g.kind === "company" && <svg viewBox="0 0 12 12" width="10" height="10" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M3 4h6M3 6.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>}
                      {g.kind === "claim"   && <svg viewBox="0 0 12 12" width="10" height="10" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>}
                      {g.kind === "action"  && <svg viewBox="0 0 12 12" width="10" height="10" fill="none"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <span className="cmd-row-l">
                      <span className="cmd-row-title">
                        {g.kind === "company" && <><span>{it.name}</span><span className="cmd-ticker mono">{it.ticker}</span></>}
                        {g.kind === "claim"   && <span>{it.headline}</span>}
                        {g.kind === "action"  && <span>{it.label}</span>}
                      </span>
                      <span className="cmd-row-hint mono">
                        {g.kind === "company" && `${it.sector} · risk ${it.risk}`}
                        {g.kind === "claim"   && `${it.id} · ${it.riskLevel}`}
                        {g.kind === "action"  && it.hint}
                      </span>
                    </span>
                    {g.kind === "company" && (
                      <span className="cmd-row-r mono" style={{ color: it.risk > 60 ? "var(--c-bad)" : it.risk > 30 ? "var(--c-warn)" : "var(--c-ok)" }}>{it.risk}</span>
                    )}
                    {g.kind === "claim" && (
                      <span className="cmd-row-r mono" style={{ color: it.score > 60 ? "var(--c-bad)" : it.score > 30 ? "var(--c-warn)" : "var(--c-ok)" }}>{it.score}</span>
                    )}
                    {g.kind === "action" && <span className="cmd-row-r mono cmd-enter">↵</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </div>

        <footer className="cmd-foot mono">
          <span><kbd className="cmd-kb">↑</kbd><kbd className="cmd-kb">↓</kbd> navigate</span>
          <span><kbd className="cmd-kb">↵</kbd> open</span>
          <span><kbd className="cmd-kb">esc</kbd> close</span>
          <span className="cmd-foot-r mute">{flatItems.length} result{flatItems.length !== 1 ? "s" : ""}</span>
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────── Settings sheet
export function SettingsSheet({ open, onClose }) {
  const [sort, setSort] = useState("score-desc");
  const [cite, setCite] = useState("reuters");

  if (!open) return null;

  return (
    <div className="cmd-wrap" onClick={(e) => { if (e.target.classList.contains("cmd-wrap")) onClose(); }}>
      <div className="settings" role="dialog" aria-label="Settings">
        <header className="settings-head">
          <div>
            <div className="mono small mute" style={{ letterSpacing: ".06em", marginBottom: 4 }}>WORKSPACE</div>
            <h3 className="settings-title">Preferences</h3>
          </div>
          <button className="ev-drawer-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="settings-body">
          {/* Default sort */}
          <div className="settings-row">
            <div>
              <div className="settings-row-l">Default sort</div>
              <div className="settings-row-h mono small mute">How the claim portfolio orders by default</div>
            </div>
            <div className="settings-pills-inline">
              {[
                { v: "score-desc", l: "Risk: high → low" },
                { v: "score-asc",  l: "Risk: low → high" },
                { v: "date",       l: "Most recent" },
              ].map(o => (
                <button key={o.v}
                  className={"settings-pill-sm" + (sort === o.v ? " on" : "")}
                  onClick={() => setSort(o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Citation style */}
          <div className="settings-row">
            <div>
              <div className="settings-row-l">Citation style</div>
              <div className="settings-row-h mono small mute">Used by ⌘C and the Cite button on every report</div>
            </div>
            <div className="settings-pills-inline">
              {[
                { v: "reuters", l: "Reuters" },
                { v: "ap",      l: "AP" },
                { v: "apa",     l: "APA 7th" },
                { v: "chicago", l: "Chicago" },
              ].map(o => (
                <button key={o.v}
                  className={"settings-pill-sm" + (cite === o.v ? " on" : "")}
                  onClick={() => setCite(o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="settings-foot">
          <button className="rep-action ghost" onClick={onClose}>Close</button>
          <button className="rep-action" onClick={() => { onClose(); gwdToast("Preferences saved", { kind: "ok" }); }}>
            Save preferences
          </button>
        </footer>
      </div>
    </div>
  );
}
