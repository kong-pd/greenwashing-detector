// Pure, DOM-free helpers shared across components.
// Kept React-free so it imports cleanly in node test runs.

/**
 * Normalise an evidence `url` into a safe, openable href.
 *
 * Evidence URLs arrive in three shapes:
 *   - full URLs from the live backend  → "https://ft.com/article"  (kept as-is)
 *   - bare domains from demo data       → "reuters.com"            (gets https://)
 *   - the "internal" sentinel           → analyzer-only evidence   (no external source)
 *
 * Returns a usable href string, or null when there is no external source to open
 * (so callers can render a non-link state instead of a broken relative link).
 *
 * @param {unknown} url
 * @returns {string | null}
 */
export function toHref(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u || u === "internal") return null;
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}
