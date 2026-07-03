// PROD-2 — the regulation mapping layer.
//
// A CURATED, static table: flag type → the regulation clauses a compliance
// reader would check first. Deliberately data, not AI: the mapping must be
// reviewable line by line, and it ships with an explicit "indicative, not
// legal advice" note — a compliance-scoring product that overstated its
// legal authority would be its own worst finding.
import { describe, it, expect } from "vitest";
import { regRefs, FLAG_TYPES, INDICATIVE_NOTE } from "../regmap.js";

describe("regRefs", () => {
  it("covers every flag type the rubric can emit", () => {
    expect(FLAG_TYPES).toEqual([
      "Vague Claims", "Data Contradiction", "Lack of Certification",
      "Negative News", "Greenwashing Language",
    ]);
    for (const t of FLAG_TYPES) {
      const refs = regRefs(t);
      expect(refs.length).toBeGreaterThanOrEqual(2);
      for (const r of refs) {
        expect(r.reg).toBeTruthy();     // full regulation name (tooltip)
        expect(r.ref).toBeTruthy();     // clause reference
        expect(r.short.length).toBeLessThanOrEqual(16); // chip-sized label
      }
    }
  });

  it("pins the exact chips the UI will show for the cached-Shell flags", () => {
    expect(regRefs("Data Contradiction").map(r => r.short))
      .toEqual(["EU GCD Art. 4", "FTC §260.2", "ISO 14021 §5.7"]);
    expect(regRefs("Lack of Certification").map(r => r.short))
      .toEqual(["EU GCD Art. 10", "FTC §260.6", "ISO 14021 §5.7"]);
    expect(regRefs("Vague Claims").map(r => r.short))
      .toEqual(["EU GCD Art. 3", "FTC §260.4", "ISO 14021 §5.4"]);
  });

  it("returns [] for unknown types — never invents a citation", () => {
    expect(regRefs("Some Future Flag")).toEqual([]);
    expect(regRefs(undefined)).toEqual([]);
  });

  it("carries the honesty note verbatim", () => {
    expect(INDICATIVE_NOTE.toLowerCase()).toContain("not legal advice");
    expect(INDICATIVE_NOTE.toLowerCase()).toContain("indicative");
  });
});
