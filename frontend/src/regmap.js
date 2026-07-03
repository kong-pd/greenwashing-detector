// regmap.js — the regulation mapping layer (PROD-2).
//
// A CURATED, static table: flag type → the regulation clauses a compliance
// reader would check first. Deliberately data, not AI — the mapping must be
// reviewable line by line, versioned in Git like the rubric, and honest
// about its standing: these are indicative starting points for a compliance
// review, not legal determinations. A compliance-scoring product that
// overstated its legal authority would be its own worst finding.
//
// short  → chip label (≤16 chars, rendered inline on the flag)
// reg    → full regulation name (travels as the tooltip)
// ref    → clause reference within it

export const INDICATIVE_NOTE =
  "Regulatory references are indicative mappings for further review — not legal advice.";

const EU_GCD = "EU Green Claims Directive";
const FTC    = "FTC Guides for the Use of Environmental Marketing Claims (Green Guides)";
const ISO    = "ISO 14021 — Environmental labels and declarations (self-declared claims)";
const UCPD   = "EU Unfair Commercial Practices Directive";

const REG_MAP = {
  "Vague Claims": [
    { short: "EU GCD Art. 3",   reg: EU_GCD, ref: "Art. 3 — substantiation of explicit environmental claims" },
    { short: "FTC §260.4",      reg: FTC,    ref: "§260.4 — general environmental benefit claims" },
    { short: "ISO 14021 §5.4",  reg: ISO,    ref: "§5.4 — vague or non-specific claims" },
  ],
  "Data Contradiction": [
    { short: "EU GCD Art. 4",   reg: EU_GCD, ref: "Art. 4 — verification of claims against evidence" },
    { short: "FTC §260.2",      reg: FTC,    ref: "§260.2 — deception and reasonable basis" },
    { short: "ISO 14021 §5.7",  reg: ISO,    ref: "§5.7 — claims must be accurate and verifiable" },
  ],
  "Lack of Certification": [
    { short: "EU GCD Art. 10",  reg: EU_GCD, ref: "Art. 10 — verification and certification of claims" },
    { short: "FTC §260.6",      reg: FTC,    ref: "§260.6 — certifications and seals of approval" },
    { short: "ISO 14021 §5.7",  reg: ISO,    ref: "§5.7 — accessible verification for self-declared claims" },
  ],
  "Negative News": [
    { short: "UCPD Art. 6",     reg: UCPD,   ref: "Art. 6 — misleading actions (overall impression)" },
    { short: "FTC §260.2",      reg: FTC,    ref: "§260.2 — net impression of the marketing claim" },
  ],
  "Greenwashing Language": [
    { short: "FTC §260.4",      reg: FTC,    ref: "§260.4 — unqualified general benefit claims" },
    { short: "ISO 14021 §5.3",  reg: ISO,    ref: "§5.3 — use of vague terms ('green', 'eco-friendly')" },
    { short: "EU GCD Art. 3",   reg: EU_GCD, ref: "Art. 3 — substantiation of explicit environmental claims" },
  ],
};

export const FLAG_TYPES = Object.keys(REG_MAP);

/** Regulation references for one flag type. Unknown type → [] — the UI
 *  renders nothing rather than inventing a citation. */
export function regRefs(type) {
  return REG_MAP[type] || [];
}
