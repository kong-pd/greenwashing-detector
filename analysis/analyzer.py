import anthropic
import google.generativeai as genai
import json
import os
from pathlib import Path

# ─── Local cache ──────────────────────────────────────────────────────────────

_CACHE_PATH = Path(__file__).parent / "local_cache.json"

def _load_local_cache() -> dict:
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Local cache load failed: {e}")
        return {}

_LOCAL_CACHE = _load_local_cache()


def _lookup_local_cache(company_name: str) -> dict | None:
    key = company_name.strip().lower()
    if key in _LOCAL_CACHE:
        print(f"Local cache hit (exact): {key}")
        return _LOCAL_CACHE[key]
    for cache_key, result in _LOCAL_CACHE.items():
        if cache_key in key or key in cache_key:
            print(f"Local cache hit (partial): '{key}' → '{cache_key}'")
            return result
    print(f"Local cache miss: {key}")
    return None


# ─── Weight clamping ──────────────────────────────────────────────────────────
# After the AI assigns weights, clamp to the defined band per kind.
# This ensures the AI cannot deviate from the rules regardless of its output.

WEIGHT_BANDS: dict[str, tuple[float, float]] = {
    "Filing":     (0.85, 0.95),
    "Database":   (0.80, 0.92),
    "News":       (0.40, 0.80),   # wide band; AI differentiates by outlet tier
    "Document":   (0.45, 0.65),
    "Linguistic": (0.30, 0.55),
}

def _clamp_weight(kind: str, weight: float | None) -> float:
    lo, hi = WEIGHT_BANDS.get(kind, (0.0, 1.0))
    if weight is None:
        # AI failed to assign — use midpoint of band
        return round((lo + hi) / 2, 2)
    return round(max(lo, min(hi, float(weight))), 2)


def _normalise_evidence(evidence_list: list[dict]) -> list[dict]:
    """
    Post-process the evidence list returned by the AI:
    - Clamp weights to defined bands
    - Sort by weight descending
    - Ensure all required fields are present
    """
    normalised = []
    for item in evidence_list:
        kind   = item.get("kind", "News")
        weight = _clamp_weight(kind, item.get("weight"))
        normalised.append({
            "id":     item.get("id", ""),
            "kind":   kind,
            "title":  item.get("title", ""),
            "org":    item.get("org", ""),
            "date":   item.get("date", ""),
            "url":    item.get("url", ""),
            "quote":  (item.get("quote") or "")[:300],
            "weight": weight,
        })
    return sorted(normalised, key=lambda x: x["weight"], reverse=True)


# ─── Evidence list formatter ──────────────────────────────────────────────────

def _format_evidence_for_prompt(evidence_list: list[dict]) -> str:
    """
    Format the evidence list as a numbered text block for the AI prompt.
    """
    if not evidence_list:
        return "No external news articles available."

    lines = []
    for ev in evidence_list:
        lines.append(
            f"[{ev['id']}] Kind: {ev['kind']} | Org: {ev['org']} | Date: {ev['date']}\n"
            f"Title: {ev['title']}\n"
            f"URL: {ev['url']}\n"
            f'Quote: "{ev["quote"]}"'
        )
    return "\n\n".join(lines)


# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a professional ESG fact-checking analyst specialising in identifying greenwashing in corporate sustainability claims.

Your task is to:
1. Score the company content against the five-dimension rubric below
2. Assign relevance weights to each evidence item following the weight rules below
3. Return a single structured JSON object — nothing else

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING RUBRIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score each dimension 0–20. Higher = greater greenwashing risk.

1. Claim Specificity (0–20) [TCFD]
   0  = Clear, time-bound, quantifiable targets with interim milestones
   10 = Goals stated but vague, no defined timeline or baseline
   20 = Slogans only — "committed to", "striving for" — zero measurable commitments

2. Data Consistency (0–20) [GRI 305]
   0  = Claims fully align with CDP, EU ETS, and other external databases
   10 = Minor discrepancies or claims that cannot be independently verified
   20 = Claims directly contradict verified external data

3. Third-Party Verification (0–20) [EU Taxonomy Art. 8]
   0  = Multiple credible independent certifications (SBTi, B Corp, ISCC, CDP A-list)
   10 = Single certification or certification from a low-credibility body
   20 = No independent verification of any kind

4. Negative News (0–20) [GRI 2-27]
   0  = No negative coverage in major media or regulatory records
   10 = Minor controversy or criticism, no formal regulatory action
   20 = Active regulatory investigation or major media scandal in past 12 months

5. Greenwashing Language (0–20) [EU Green Claims Directive 2024]
   0  = Precise language backed by specific data, no undefined superlatives
   10 = Some aspirational verbs or vague qualifiers used alongside data
   20 = Heavy use of "committed to", "net-positive", "green future" with no data support

Total Score = sum of all five (0–100)
Risk thresholds: 0–30 = Low Risk · 31–60 = Medium Risk · 61–100 = High Risk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVIDENCE WEIGHT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each evidence item provided, assign a weight (0–1) strictly within
the band for its kind. Do not assign weights outside these ranges.

  Filing   (regulatory body)              → 0.85 to 0.95
  Database (public emissions/cert DB)     → 0.80 to 0.92
  News     (Reuters/FT/Bloomberg/BBC)     → 0.65 to 0.80
  News     (minor or regional outlet)     → 0.40 to 0.60
  Document (company self-disclosed)       → 0.45 to 0.65
  Linguistic (AI pattern detection)       → 0.30 to 0.55

Within each band, assign higher weight to items that more directly
contradict or corroborate the specific claim being analysed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON. No explanation, no preamble, no markdown fences.

{
  "score": <integer 0–100>,
  "risk_level": <"Low Risk" | "Medium Risk" | "High Risk">,
  "dimension_scores": {
    "specificity":               <integer 0–20>,
    "data_consistency":          <integer 0–20>,
    "third_party_certification": <integer 0–20>,
    "negative_news":             <integer 0–20>,
    "greenwashing_language":     <integer 0–20>
  },
  "flags": [
    {
      "type":        <"Vague Claims" | "Data Contradiction" | "Lack of Certification" | "Negative News" | "Greenwashing Language">,
      "description": <1–2 sentence specific finding referencing the content provided>,
      "source":      <specific source name or URL from the evidence list>
    }
  ],
  "evidence": [
    {
      "id":     <copy from input evidence list>,
      "kind":   <copy from input evidence list>,
      "title":  <copy from input evidence list>,
      "org":    <copy from input evidence list>,
      "date":   <copy from input evidence list>,
      "url":    <copy from input evidence list>,
      "quote":  <copy from input evidence list>,
      "weight": <float within the prescribed band for this kind>
    }
  ],
  "summary": <100–150 word English summary of overall greenwashing risk>
}

Rules:
- flags: exactly 3, one per highest-scoring dimension
- evidence: include ALL items from the input evidence list with your assigned weights
- All weights must fall within the prescribed bands — do not deviate
- Do not add evidence items that were not in the input list"""


MOCK_RESULT = {
    "score": 72,
    "risk_level": "High Risk",
    "riskLevel":  "High Risk",
    "confidence": 0.85,
    "dimension_scores": {
        "specificity":               15,
        "data_consistency":          18,
        "third_party_certification": 10,
        "negative_news":             19,
        "greenwashing_language":     10,
    },
    "dimensionScores": {
        "specificity":               15,
        "data_consistency":          18,
        "third_party_certification": 10,
        "negative_news":             19,
        "greenwashing_language":     10,
    },
    "flags": [
        {
            "type":        "Data Contradiction",
            "severity":    "high",
            "description": "[MOCK] Company claims a 15% reduction in carbon emissions, but external data shows a 3% increase over the same period.",
            "source":      "Mock Data",
        },
        {
            "type":        "Negative News",
            "severity":    "high",
            "description": "[MOCK] The company is under investigation by regulators for misleading carbon-neutral advertising.",
            "source":      "Mock News",
        },
        {
            "type":        "Vague Claims",
            "severity":    "medium",
            "description": "[MOCK] Sustainability report relies heavily on phrases like 'committed to net-zero' with no defined timeline.",
            "source":      "Mock Website",
        },
    ],
    "evidence": [],
    "summary": "[MOCK MODE] This is a pre-set example report used as an emergency fallback when AI APIs are unavailable.",
}


# ─── User prompt builder ──────────────────────────────────────────────────────

def build_user_prompt(company_name: str, scraped_content: str,
                      evidence_list: list[dict], cdp_data: str) -> str:
    evidence_text = _format_evidence_for_prompt(evidence_list)
    return f"""Analyse the following company's sustainability claims.

## Company Name
{company_name}

## Company Content (scraped ESG page / user-provided)
{scraped_content}

## External Evidence (assembled by backend)

### News Articles
{evidence_text}

### Emissions Database Records
{cdp_data}

Assign weights to each evidence item following the rules in your instructions,
score the company on all five dimensions, and return the complete JSON result."""


# ─── Post-processing ──────────────────────────────────────────────────────────

def _process_result(raw: dict, input_evidence: list[dict]) -> dict:
    """
    Normalise the AI response:
    - Clamp and sort evidence weights
    - Add severity to flags if missing
    - Add camelCase aliases for frontend compatibility
    - If AI returned no evidence, fall back to input_evidence with midpoint weights
    """
    # Evidence: use AI-weighted version if returned, else fall back to inputs
    evidence_from_ai = raw.get("evidence") or []
    if evidence_from_ai:
        evidence = _normalise_evidence(evidence_from_ai)
    elif input_evidence:
        # AI didn't return evidence — assign midpoint weights to input items
        evidence = _normalise_evidence([
            {**ev, "weight": None} for ev in input_evidence
        ])
    else:
        evidence = []

    # Flags — add severity if missing
    flags = []
    for f in raw.get("flags") or []:
        ftype = f.get("type", "")
        severity = f.get("severity") or (
            "high"   if ftype in ("Data Contradiction", "Negative News") else
            "medium" if ftype in ("Vague Claims", "Lack of Certification") else
            "low"
        )
        flags.append({**f, "severity": severity})

    dim = raw.get("dimension_scores") or {}

    return {
        "score":      raw.get("score"),
        "risk_level": raw.get("risk_level"),
        "riskLevel":  raw.get("risk_level"),
        "confidence": 0.85,
        "summary":    raw.get("summary", ""),
        "dimension_scores":  dim,
        "dimensionScores": {
            "specificity":               dim.get("specificity", 0),
            "data_consistency":          dim.get("data_consistency", 0),
            "third_party_certification": dim.get("third_party_certification", 0),
            "negative_news":             dim.get("negative_news", 0),
            "greenwashing_language":     dim.get("greenwashing_language", 0),
        },
        "flags":    flags,
        "evidence": evidence,
        "sources":  [ev["url"] for ev in evidence if ev.get("url")],
    }


# ─── Model callers ────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text.strip())


def analyze_with_claude(company_name, content, evidence_list, cdp):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,   # increased to accommodate evidence array
        system=SYSTEM_PROMPT,
        messages=[{
            "role":    "user",
            "content": build_user_prompt(company_name, content, evidence_list, cdp),
        }],
    )
    return _parse_json(response.content[0].text)


def analyze_with_gemini(company_name, content, evidence_list, cdp):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )
    response = model.generate_content(
        build_user_prompt(company_name, content, evidence_list, cdp)
    )
    return _parse_json(response.text)


# ─── Main entry point ─────────────────────────────────────────────────────────

def analyze(company_name: str, content: str,
            evidence_list: list[dict] | None = None,
            cdp: str = "No data") -> dict | None:
    """
    Four-layer fallback chain:
      1. Mock mode  (USE_MOCK=true)
      2. Claude API (primary)
      3. Gemini API (automatic fallback)
      4. Local cache (zero-network fallback for demo companies)
      5. Generic mock (absolute last resort)

    Args:
        company_name:  Company name for matching and display
        content:       Scraped or user-provided ESG content
        evidence_list: Structured evidence objects from enricher.py
        cdp:           CDP data string or stub message
    """
    ev = evidence_list or []

    # ── Layer 1: Mock mode ────────────────────────────────────────────────────
    if os.environ.get("USE_MOCK", "false").lower() == "true":
        print("Mock mode active")
        return MOCK_RESULT

    # ── Layer 2: Claude ───────────────────────────────────────────────────────
    try:
        raw = analyze_with_claude(company_name, content, ev, cdp)
        result = _process_result(raw, ev)
        print("Claude API: success")
        return result
    except Exception as e:
        print(f"Claude API failed: {e}")

    # ── Layer 3: Gemini ───────────────────────────────────────────────────────
    try:
        raw = analyze_with_gemini(company_name, content, ev, cdp)
        result = _process_result(raw, ev)
        print("Gemini API: success")
        return result
    except Exception as e:
        print(f"Gemini API failed: {e}")

    # ── Layer 4: Local cache ──────────────────────────────────────────────────
    cached = _lookup_local_cache(company_name)
    if cached:
        print(f"Using local cache for: {company_name}")
        for flag in cached.get("flags", []):
            if "severity" not in flag:
                t = flag.get("type", "")
                flag["severity"] = (
                    "high"   if t in ("Data Contradiction", "Negative News") else
                    "medium" if t in ("Vague Claims", "Lack of Certification") else
                    "low"
                )
        if "dimensionScores" not in cached and "dimension_scores" in cached:
            cached["dimensionScores"] = cached["dimension_scores"]
        if "riskLevel" not in cached and "risk_level" in cached:
            cached["riskLevel"] = cached["risk_level"]
        # Attach real evidence if available, else empty list
        if "evidence" not in cached:
            cached["evidence"] = _normalise_evidence(ev) if ev else []
        return cached

    # ── Layer 5: Generic mock ─────────────────────────────────────────────────
    print(f"All layers failed for '{company_name}' — returning generic mock")
    return MOCK_RESULT
