import os
from dotenv import load_dotenv
load_dotenv('../.env')

from analyzer import analyze_with_groq, _process_result

raw = analyze_with_groq(
    company_name="Patagonia",
    content="Patagonia is B Corp certified and publishes full supply chain data.",
    evidence_list=[],
    cdp="No CDP data."
)
result = _process_result(raw, [])
print(f"Score: {result['score']}")
print(f"Risk:  {result['risk_level']}")
print(f"Flags: {len(result['flags'])}")