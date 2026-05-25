import anthropic
import google.generativeai as genai
import json
import os

SYSTEM_PROMPT = """You are a professional ESG fact-checking analyst specialising in identifying greenwashing in corporate sustainability claims.

Your task is to score the provided company content against a defined rubric and return a structured JSON analysis.

## Scoring Rubric

Score each of the following five dimensions from 0 to 20. Higher scores indicate higher greenwashing risk.

1. Claim Specificity (0-20)
   - 0: Clear, time-bound, quantifiable targets
   - 10: Vague goals with no timeline
   - 20: Slogans only, zero measurable commitments

2. Data Consistency (0-20)
   - 0: Claims fully align with external databases
   - 10: Minor discrepancies or unverifiable claims
   - 20: Claims directly contradict external data

3. Third-Party Verification (0-20)
   - 0: Multiple credible third-party certifications
   - 10: Single or low-credibility certification
   - 20: No independent verification whatsoever

4. Negative News (0-20)
   - 0: No negative coverage
   - 10: Minor controversy, no regulatory action
   - 20: Active regulatory investigation or major media scandal

5. Greenwashing Language (0-20)
   - 0: Precise language backed by data
   - 10: Some vague terms used
   - 20: Heavy use of buzzwords like "committed to", "striving for", "green future"

Total Score = sum of all five dimensions (0-100)

## Output Requirements

Return ONLY valid JSON. No explanation, no preamble, no markdown code fences.
Strictly follow this schema — do not add or remove any fields:

{
  "score": <integer total>,
  "risk_level": <"Low Risk" | "Medium Risk" | "High Risk">,
  "dimension_scores": {
    "specificity": <integer>,
    "data_consistency": <integer>,
    "third_party_certification": <integer>,
    "negative_news": <integer>,
    "greenwashing_language": <integer>
  },
  "flags": [
    {
      "type": <"Vague Claims" | "Data Contradiction" | "Lack of Certification" | "Negative News" | "Greenwashing Language">,
      "description": <1-2 sentence specific finding>,
      "source": <evidence source>
    }
  ],
  "summary": <100-150 word English summary of the overall greenwashing risk>
}

Return exactly 3 flags — one from each of the 3 highest-scoring dimensions.

Risk level thresholds:
- 0-30: Low Risk
- 31-60: Medium Risk
- 61-100: High Risk"""

MOCK_RESULT = {
    "score": 72,
    "risk_level": "High Risk",
    "dimension_scores": {
        "specificity": 15,
        "data_consistency": 18,
        "third_party_certification": 10,
        "negative_news": 19,
        "greenwashing_language": 10
    },
    "flags": [
        {
            "type": "Data Contradiction",
            "description": "[MOCK] Company claims a 15% reduction in carbon emissions, but external data shows a 3% increase over the same period.",
            "source": "Mock Data"
        },
        {
            "type": "Negative News",
            "description": "[MOCK] The company is under investigation by regulators for misleading carbon-neutral advertising.",
            "source": "Mock News"
        },
        {
            "type": "Vague Claims",
            "description": "[MOCK] Sustainability report relies heavily on phrases like 'committed to net-zero' with no defined timeline.",
            "source": "Mock Website"
        }
    ],
    "summary": "[MOCK MODE] This is a pre-set example report used as an emergency fallback when AI APIs are unavailable. The actual analysis will be generated once the API is restored. This mock result should not be used for any real assessment."
}

def build_user_prompt(company_name: str, scraped_content: str, news_results: str, cdp_data: str) -> str:
    return f"""Please analyse the following company's sustainability claims.

## Company Name
{company_name}

## Company Website / Report Content
{scraped_content}

## External Data

### Recent News (last 12 months)
{news_results}

### CDP Emissions Data
{cdp_data}

Score the company according to the rubric in your instructions and return the JSON result."""

def analyze_with_claude(company_name, content, news, cdp):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt(company_name, content, news, cdp)}]
    )
    return json.loads(response.content[0].text)

def analyze_with_gemini(company_name, content, news, cdp):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(model_name="gemini-1.5-flash", system_instruction=SYSTEM_PROMPT)
    response = model.generate_content(build_user_prompt(company_name, content, news, cdp))
    text = response.text.replace("```json", "").replace("```", "").strip()
    return json.loads(text)

def analyze(company_name: str, content: str, news: str = "No data", cdp: str = "No data"):
    # Mock mode — emergency fallback
    if os.environ.get("USE_MOCK", "false").lower() == "true":
        return MOCK_RESULT

    # Primary: Claude
    try:
        return analyze_with_claude(company_name, content, news, cdp)
    except Exception as e:
        print(f"Claude failed: {e} — switching to Gemini")

    # Fallback: Gemini
    try:
        return analyze_with_gemini(company_name, content, news, cdp)
    except Exception as e:
        print(f"Gemini failed: {e}")

    return None
