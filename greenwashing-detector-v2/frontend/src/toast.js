// toast.js — lightweight toast pub/sub singleton

const _listeners = new Set();
let _seq = 0;

export function gwdToast(message, opts = {}) {
  const t = {
    id: ++_seq,
    message,
    kind: opts.kind || "info",
    icon: opts.icon,
    ttl: opts.ttl ?? 3200,
  };
  _listeners.forEach((fn) => fn(t));
}

export function subscribeToast(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
