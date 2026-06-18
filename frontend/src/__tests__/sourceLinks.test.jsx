// Tests for the clickable source-reference feature:
//   1. toHref()  — pure URL normaliser (all input shapes)
//   2. EvidenceRow — renders a real external link for external evidence and a
//      non-link state for internal evidence. Rendered with renderToStaticMarkup
//      (react-dom/server) so it runs in node without a DOM/jsdom dependency.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { toHref } from "../utils.js";
import { EvidenceRow } from "../components/SharedComponents.jsx";

// ── toHref ───────────────────────────────────────────────────────────────────
describe("toHref", () => {
  it("keeps full http(s) URLs untouched", () => {
    expect(toHref("https://ft.com/article")).toBe("https://ft.com/article");
    expect(toHref("http://example.com")).toBe("http://example.com");
    expect(toHref("HTTPS://Example.com")).toBe("HTTPS://Example.com"); // case-insensitive match, no mutation
  });

  it("prefixes https:// onto bare domains", () => {
    expect(toHref("reuters.com")).toBe("https://reuters.com");
    expect(toHref("petrovera.com/sustainability")).toBe("https://petrovera.com/sustainability");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(toHref("  reuters.com  ")).toBe("https://reuters.com");
    expect(toHref(" https://ft.com ")).toBe("https://ft.com");
  });

  it("returns null for the internal sentinel and empty input", () => {
    expect(toHref("internal")).toBeNull();
    expect(toHref("")).toBeNull();
    expect(toHref("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(toHref(null)).toBeNull();
    expect(toHref(undefined)).toBeNull();
    expect(toHref(42)).toBeNull();
  });
});

// ── EvidenceRow link rendering ───────────────────────────────────────────────
const baseEv = {
  id: "E-01", weight: 0.8, kind: "News", title: "Headline",
  org: "Reuters", date: "2026-01-01", quote: "q",
};

describe("EvidenceRow source links", () => {
  it("renders the number as an external link for a bare-domain url", () => {
    const html = renderToStaticMarkup(
      <EvidenceRow ev={{ ...baseEv, url: "reuters.com" }} index={0} />
    );
    expect(html).toContain('href="https://reuters.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">01</a>"); // the chip shows the padded index
  });

  it("preserves a full url and makes the displayed url clickable too", () => {
    const html = renderToStaticMarkup(
      <EvidenceRow ev={{ ...baseEv, url: "https://ft.com/x" }} index={4} />
    );
    // both the chip and the url text point at the source
    const hrefCount = (html.match(/href="https:\/\/ft\.com\/x"/g) || []).length;
    expect(hrefCount).toBe(2);
    expect(html).toContain(">05</a>");
  });

  it("renders a non-link internal state for analyzer-only evidence", () => {
    const html = renderToStaticMarkup(
      <EvidenceRow ev={{ ...baseEv, kind: "Linguistic", url: "internal" }} index={6} />
    );
    expect(html).not.toContain("<a ");          // nothing clickable
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("is-internal");        // explicit muted state
    expect(html).toContain("internal analysis");  // friendly label, not the raw sentinel
  });
});

// ── EvidenceDrawer detail panel ──────────────────────────────────────────────
import { EvidenceDrawer } from "../screens/ReportScreen.jsx";

const drawerClaim = (ev) => ({ headline: "Acme claim", flags: [], evidence: [ev] });

describe("EvidenceDrawer SOURCE URL", () => {
  it("renders the source URL as an external link for external evidence", () => {
    const ev = { ...baseEv, url: "ft.com/x" };
    const html = renderToStaticMarkup(<EvidenceDrawer claim={drawerClaim(ev)} ev={ev} />);
    expect(html).toContain('class="mono ev-detail-url"');
    expect(html).toContain('href="https://ft.com/x"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Open source"); // action button present
  });

  it("shows a no-external-source notice for internal evidence", () => {
    const ev = { ...baseEv, kind: "Linguistic", url: "internal" };
    const html = renderToStaticMarkup(<EvidenceDrawer claim={drawerClaim(ev)} ev={ev} />);
    expect(html).not.toContain("ev-detail-url");                 // not a link
    expect(html).toContain("internal analysis — no external source");
  });
});
