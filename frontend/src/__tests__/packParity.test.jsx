// ARCH-1 Phase A — frontend ↔ pack parity.
//
// The dimensions and flag vocabulary used to live in FOUR hand-synchronised
// places: the rubric prompt, the frontend DIMENSION_META, the mock fixture,
// and the weight code. The pack manifest is now the source of truth on the
// analysis side; this test pins the FRONTEND copies to it, so any drift is
// a red test instead of a silently mislabelled report.
//
// Scope note: parity covers semantic identity (dimension key + label, flag
// vocabulary, scale max). gloss / standards / rubric hints in DIMENSION_META
// are presentation and stay frontend-owned. Runtime delivery of pack meta
// (/pack/meta endpoint) is Phase B — build-time parity is the honest
// incremental step.
//
// Path is anchored to THIS FILE (import.meta.url), not the CWD — the
// launch-directory lesson from the tracing incident, applied forward.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DIMENSION_META } from "../components/SharedComponents.jsx";
import { FLAG_TYPES } from "../regmap.js";

const pack = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../analysis/packs/greenwash/pack.json", import.meta.url)),
  "utf-8",
));

describe("frontend ↔ greenwash pack parity", () => {
  it("dimension keys and labels match the pack, in order", () => {
    expect(DIMENSION_META.map(d => ({ key: d.key, label: d.label })))
      .toEqual(pack.dimensions.map(d => ({ key: d.key, label: d.label })));
  });

  it("the regulation map covers exactly the pack's flag vocabulary", () => {
    expect([...FLAG_TYPES].sort()).toEqual([...pack.flag_types].sort());
  });

  it("the dimension scale matches (bars and tone thresholds assume 0–20)", () => {
    expect(pack.dimension_max).toBe(20);
  });
});
