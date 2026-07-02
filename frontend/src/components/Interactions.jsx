// Interactions.jsx — Toaster.
// (CommandPalette / NotificationsMenu / UserMenu / SettingsSheet were removed
// in P2-8: they either searched fictional data or confirmed actions that
// never happened.)
import { useState, useEffect } from "react";
import { gwdToast, subscribeToast } from "../toast.js";

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
