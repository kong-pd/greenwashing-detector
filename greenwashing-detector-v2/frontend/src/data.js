// data.js — fictional company portfolio for the Greenwashing Detector prototype.

export const COMPANY = {
  id: "petrovera-global",
  legalName: "Petrovera Global plc",
  ticker: "PTV.L",
  exchange: "LSE",
  sector: "Integrated Oil & Gas",
  headquarters: "Rotterdam, Netherlands",
  employees: 87400,
  fy: "FY 2024",
  revenue: "$312.4B",
  aggregateRisk: 67,
  aggregateRiskTrend: "+4",
  claimsAnalyzed: 8,
  claimsHighRisk: 4,
  claimsMediumRisk: 3,
  claimsLowRisk: 1,
  lastUpdated: "2026-05-23 14:08 UTC",
  isin: "GB00B0PETV01",
  blurb:
    "Multinational integrated energy company with upstream operations in 31 countries and downstream retail across 64 markets. Published 4th annual Sustainability Report in March 2026.",
};

export const PEERS = [
  { id: "altavia",          name: "AltaVia Energy",          ticker: "AVE",   risk: 71 },
  { id: "petrovera-global", name: "Petrovera Global plc",    ticker: "PTV.L", risk: 67, self: true },
  { id: "northsea",         name: "North Sea Resources",     ticker: "NSR",   risk: 58 },
  { id: "helion",           name: "Helion Petroleum",        ticker: "HEL",   risk: 54 },
  { id: "brentmoor",        name: "Brentmoor Energy",        ticker: "BME",   risk: 49 },
  { id: "kestrel",          name: "Kestrel Resources",       ticker: "KSR",   risk: 41 },
];

export const WATCHLIST = [
  { id: "petrovera-global", name: "Petrovera Global",    ticker: "PTV.L", risk: 67, delta: +4, sector: "Oil & Gas" },
  { id: "altavia",          name: "AltaVia Energy",      ticker: "AVE",   risk: 71, delta: -2, sector: "Oil & Gas" },
  { id: "cirroban",         name: "Cirroban Fashion",    ticker: "CBN",   risk: 78, delta: +6, sector: "Apparel" },
  { id: "northsea",         name: "North Sea Resources", ticker: "NSR",   risk: 58, delta: 0,  sector: "Oil & Gas" },
  { id: "veracore",         name: "VeraCore Tech",       ticker: "VCT",   risk: 34, delta: -3, sector: "Software" },
  { id: "atlasagri",        name: "Atlas Agri Holdings", ticker: "ATL",   risk: 62, delta: +1, sector: "Agriculture" },
  { id: "halicombe",        name: "Halicombe Air",       ticker: "HAL",   risk: 81, delta: +9, sector: "Aviation" },
  { id: "lindberg",         name: "Lindberg Foods",      ticker: "LBG",   risk: 28, delta: -1, sector: "Food & Bev" },
  { id: "merritan",         name: "Merritan Cement",     ticker: "MRT",   risk: 73, delta: +3, sector: "Materials" },
  { id: "soltera",          name: "Soltera Bank",        ticker: "STR",   risk: 45, delta: -5, sector: "Financials" },
];

export const RECENT_CLAIMS = [
  { company: "Halicombe Air",    snippet: "\u201Cthe world\u2019s first net-zero airline by 2035\u201D",         risk: 87 },
  { company: "Cirroban Fashion", snippet: "\u201C100% sustainable cotton across our spring collection\u201D",     risk: 78 },
  { company: "Merritan Cement",  snippet: "\u201Cgreen cement reducing embodied carbon by half\u201D",            risk: 72 },
  { company: "Atlas Agri",       snippet: "\u201Cregenerative agriculture across our supply chain\u201D",         risk: 64 },
  { company: "Lindberg Foods",   snippet: "\u201CFY24 Scope 1+2 emissions verified by SBTi at \u221213.4%\u201D", risk: 22 },
];

export const CLAIMS = [
  {
    id: "CLM-2026-0331-A",
    headline: "Net-zero emissions by 2050 across Scope 1, 2 and 3",
    shortQuote: "We are committed to becoming a net-zero energy business by 2050.",
    source: "Petrovera Sustainability Report 2025, p.4",
    sourceType: "Annual Report",
    capturedAt: "2026-03-31",
    capturedFrom: "petrovera.com/sustainability/report-2025.pdf",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 78,
    riskLevel: "High Risk",
    confidence: 0.91,
    dimensionScores: {
      specificity: 18,
      data_consistency: 14,
      third_party_certification: 16,
      negative_news: 15,
      greenwashing_language: 15,
    },
    flags: [
      {
        type: "Vague Claims",
        severity: "high",
        description:
          "Headline target lacks interim milestones for 2030/2035/2040 and excludes specific operational baselines. Scope 3 inclusion is qualified by the phrase \u201Cwhere material\u201D in the footnotes.",
        source: "Sustainability Report 2025, p.4, fn 3",
      },
      {
        type: "Lack of Certification",
        severity: "high",
        description:
          "No third-party verification of 2050 pathway. SBTi submission listed as \u201Cunder review\u201D since 2023. No CDP A-list rating; ISS ESG downgraded from Prime to C in Feb 2026.",
        source: "SBTi corporate database; ISS ESG bulletin 2026-02-14",
      },
      {
        type: "Greenwashing Language",
        severity: "medium",
        description:
          "Heavy reliance on aspirational verbs (\u201Cstriving\u201D, \u201Caspires\u201D, \u201Cintends\u201D) appearing 47 times across 12 pages. No commitment language tied to executive compensation.",
        source: "Linguistic audit, NLP module v3.2",
      },
    ],
    summary:
      "Petrovera\u2019s headline 2050 net-zero commitment carries elevated greenwashing risk. While the target is publicly stated and reiterated across investor materials, it lacks the interim milestones, Scope 3 baselines, and third-party verification that would substantiate a credible decarbonisation pathway. Linguistic patterns across the 2025 report skew heavily toward aspirational rather than commitment language, and the company\u2019s SBTi submission remains under review more than two years after filing. We assess the claim as directionally consistent with peers but structurally underspecified \u2014 journalists should treat the 2050 framing as a marketing wrapper rather than a binding plan.",
    evidence: [
      { id: "E-01", weight: 0.94, kind: "Filing",     title: "SBTi Public Database \u2014 Petrovera entry",                org: "Science Based Targets initiative", date: "2026-04-02", quote: "Status: Commitment under review since 2023-08-11. No validated targets on file.",                            url: "sciencebasedtargets.org/companies-taking-action" },
      { id: "E-02", weight: 0.88, kind: "Filing",     title: "CDP Climate Change 2024 \u2014 Petrovera disclosure",        org: "CDP Worldwide",                    date: "2025-07-12", quote: "Performance band: D. Self-reported scope 3 coverage: 41% (categories 1, 11 only).",                       url: "cdp.net/en/responses" },
      { id: "E-03", weight: 0.82, kind: "Document",   title: "Petrovera Sustainability Report 2025",                       org: "Petrovera Global plc",             date: "2026-03-15", quote: "We aspire to align with a 1.5\u00B0C pathway and are striving to engage suppliers across material categories.", url: "petrovera.com/sustainability" },
      { id: "E-04", weight: 0.71, kind: "News",       title: "ISS ESG downgrades Petrovera to C",                          org: "Responsible Investor",             date: "2026-02-14", quote: "Analysts cite \u201Cmaterial gaps in transition plan disclosure\u201D as the primary driver of the downgrade.", url: "responsible-investor.com" },
      { id: "E-05", weight: 0.66, kind: "Database",   title: "Climate Action 100+ Net-Zero Benchmark",                     org: "CA100+",                           date: "2025-11-30", quote: "Petrovera meets 3 of 10 disclosure indicators. Capital allocation alignment: Not meeting.",                  url: "climateaction100.org" },
      { id: "E-06", weight: 0.58, kind: "News",       title: "Petrovera CEO restates 2050 ambition at Davos",              org: "Reuters",                          date: "2026-01-18", quote: "We remain unwavering in our 2050 commitment, said the chief executive in a panel discussion.",               url: "reuters.com" },
      { id: "E-07", weight: 0.42, kind: "Linguistic", title: "NLP audit \u2014 47 instances of aspirational verbs",        org: "GWD analyzer v3.2",                date: "2026-05-23", quote: "Tokens matched: striving (18), aspires (12), intends (9), committed to (8). No SMART-target framing detected.", url: "internal" },
    ],
  },
  {
    id: "CLM-2026-0331-B",
    headline: "30% reduction in operational emissions since 2019",
    shortQuote: "We have reduced operational (Scope 1 + 2) emissions by 30% since our 2019 baseline.",
    source: "Investor Day presentation, Feb 2026, slide 22",
    sourceType: "Investor Materials",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 62,
    riskLevel: "High Risk",
    confidence: 0.87,
    dimensionScores: {
      specificity: 6,
      data_consistency: 19,
      third_party_certification: 12,
      negative_news: 13,
      greenwashing_language: 12,
    },
    flags: [
      {
        type: "Data Contradiction",
        severity: "high",
        description:
          "Reported \u221230% Scope 1+2 reduction since 2019 is inconsistent with EU ETS verified emissions data, which shows \u22128.4% for the same European assets. The headline figure relies on a 2019 baseline restated in 2023 following the Nigerian asset divestment.",
        source: "EU ETS Union Registry; Petrovera 2023 Restated Baseline",
      },
      {
        type: "Data Contradiction",
        severity: "medium",
        description:
          "Methodology change in 2023 reclassified 7.2 MtCO\u2082e of flared gas from Scope 1 to \u201Coperated but not equity-controlled\u201D, removing it from headline disclosure.",
        source: "Notes to FY23 emissions inventory, p.18",
      },
      {
        type: "Lack of Certification",
        severity: "medium",
        description:
          "Limited assurance opinion from auditor covers methodology only, not baseline restatement. No reasonable assurance has been obtained.",
        source: "Independent Assurance Statement 2025, p.2",
      },
    ],
    summary:
      "The headline figure of a 30% operational emissions reduction is the most material quantitative claim in Petrovera\u2019s 2025 disclosure and the one most likely to be repeated by analysts and journalists. Our cross-check against the EU ETS Union Registry and the company\u2019s own 2023 baseline-restatement notes shows the figure is constructed primarily through divestment and reclassification rather than absolute decarbonisation. On a like-for-like basis covering the European downstream estate, verified emissions fell by 8.4% over the same window. Limited assurance does not cover the baseline restatement. This is the highest-priority claim for journalist follow-up.",
    evidence: [
      { id: "E-01", weight: 0.96, kind: "Database", title: "EU ETS Union Registry \u2014 Petrovera installations 2019\u20132024", org: "European Commission",     date: "2025-04-01", quote: "Aggregate verified emissions across 14 Petrovera installations: 41.2 MtCO\u2082e (2019) \u2192 37.7 MtCO\u2082e (2024). Reduction: 8.5%.", url: "ec.europa.eu/clima" },
      { id: "E-02", weight: 0.92, kind: "Document", title: "Petrovera 2023 Restated Baseline Memorandum",                          org: "Petrovera Global plc",    date: "2023-09-08", quote: "Following the divestment of Nigerian upstream interests, the 2019 baseline has been restated from 64.1 to 51.2 MtCO\u2082e.",                   url: "petrovera.com/ir" },
      { id: "E-03", weight: 0.81, kind: "Filing",   title: "FY23 Emissions Inventory \u2014 Notes p.18",                            org: "Petrovera Global plc",    date: "2025-03-15", quote: "Flared gas from operated-but-non-equity-controlled assets (7.2 MtCO\u2082e) excluded from Scope 1 from FY23 onwards.",                       url: "petrovera.com/sustainability" },
      { id: "E-04", weight: 0.74, kind: "Filing",   title: "Independent Assurance Statement 2025",                                  org: "Reichmann Audit LLP",     date: "2026-03-10", quote: "Our limited assurance procedures did not extend to the prior-period baseline restatement.",                                                  url: "petrovera.com/sustainability" },
      { id: "E-05", weight: 0.68, kind: "News",     title: "Petrovera\u2019s emissions math, decoded",                              org: "Financial Times",         date: "2026-02-21", quote: "Analysts note that more than half of the reported reduction is attributable to portfolio reshaping rather than operational performance.",  url: "ft.com" },
      { id: "E-06", weight: 0.55, kind: "Database", title: "MSCI ESG Ratings \u2014 Petrovera",                                     org: "MSCI",                    date: "2026-04-12", quote: "Carbon emissions key issue score: 3.2/10. Trend: stable.",                                                                                    url: "msci.com/esg-ratings" },
    ],
  },
  {
    id: "CLM-2026-0331-C",
    headline: "$12B committed to clean energy through 2030",
    shortQuote: "We have committed $12 billion to clean energy investment by 2030.",
    source: "Capital Markets Day 2025, press release",
    sourceType: "Press Release",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 54,
    riskLevel: "Medium Risk",
    confidence: 0.83,
    dimensionScores: {
      specificity: 8,
      data_consistency: 13,
      third_party_certification: 11,
      negative_news: 10,
      greenwashing_language: 12,
    },
    flags: [
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "The $12B figure conflates capex already committed in 2023-24 with incremental new spending. No breakdown by technology, geography, or fiscal year.",
        source: "Capital Markets Day presentation, slide 34; FY23/24 AR capex tables",
      },
      {
        type: "Data Contradiction",
        severity: "medium",
        description:
          "Bloomberg NEF analysis places Petrovera\u2019s clean energy capex at 9% of total capex vs. a peer median of 18%. The $12B headline implies 14% of guided total capex 2025\u20132030.",
        source: "Bloomberg NEF Energy Transition Investment Trends 2026, p.41",
      },
      {
        type: "Greenwashing Language",
        severity: "low",
        description:
          "Clean energy definition in press release includes investment in LNG infrastructure and \u201Clower-carbon\u201D gas processing \u2014 categories contested by ESG analysts.",
        source: "Capital Markets Day 2025 FAQ; MSCI ESG analyst note 2026-03",
      },
    ],
    summary:
      "The $12B clean energy commitment is a material headline figure that warrants careful contextualisation. Our review finds the number includes prior-period commitments, uses a broad definition of clean energy that encompasses LNG, and sits below peer ratios on capex allocation. The underlying investment programme is real and includes genuine renewable projects, but the headline creates an impression of scale that the disaggregated data does not fully support.",
    evidence: [
      { id: "E-01", weight: 0.91, kind: "Database", title: "Bloomberg NEF Energy Transition Investment Trends 2026", org: "Bloomberg NEF",         date: "2026-03-01", quote: "Petrovera clean energy capex share: 9%. IOC peer median: 18%. Absolute spend: $1.4B (2024 actual).", url: "about.bnef.com" },
      { id: "E-02", weight: 0.84, kind: "Document", title: "Capital Markets Day 2025 \u2014 press release",          org: "Petrovera Global plc",  date: "2025-11-12", quote: "We commit $12 billion to low-carbon and clean energy investment across the 2025\u20132030 strategy period.", url: "petrovera.com/ir" },
      { id: "E-03", weight: 0.72, kind: "Filing",   title: "FY24 Annual Report \u2014 capex breakdown",              org: "Petrovera Global plc",  date: "2025-03-15", quote: "Capital expenditure FY24: $14.2B total. Low-carbon projects: $1.38B (9.7%).",                          url: "petrovera.com/ir" },
      { id: "E-04", weight: 0.58, kind: "News",     title: "Petrovera\u2019s \u201Cclean energy\u201D includes LNG", org: "Bloomberg",             date: "2026-01-22", quote: "Under Petrovera\u2019s definition, LNG infrastructure accounts for roughly a third of its clean energy investment.",  url: "bloomberg.com" },
    ],
  },
  {
    id: "CLM-2026-0331-D",
    headline: "Sustainable aviation fuel reaching 10% blend by 2030",
    shortQuote: "Our SAF programme will achieve a 10% blend rate across our aviation fuel supply by 2030.",
    source: "Petrovera Aviation Solutions brochure, Jan 2026",
    sourceType: "Marketing Material",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 71,
    riskLevel: "High Risk",
    confidence: 0.84,
    dimensionScores: {
      specificity: 14,
      data_consistency: 16,
      third_party_certification: 15,
      negative_news: 14,
      greenwashing_language: 12,
    },
    flags: [
      {
        type: "Data Contradiction",
        severity: "high",
        description:
          "Current SAF blend rate reported internally at 0.4% (FY24). Achieving 10% by 2030 requires a 25\u00D7 increase in 6 years. No credible production partnership or offtake agreement has been disclosed.",
        source: "FY24 sustainability datasheet; ICAO SAF tracker",
      },
      {
        type: "Lack of Certification",
        severity: "high",
        description:
          "No ISCC, RSB, or equivalent certification for claimed SAF volumes. ACM (Dutch Authority for Consumers and Markets) has opened a preliminary inquiry into the marketing claims.",
        source: "ACM case register 2026-03-14; ISCC certificate database",
      },
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "Brochure does not specify blend basis (volume vs. energy), feedstock mix, or geographic scope of the 10% target.",
        source: "Petrovera Aviation Solutions brochure Jan 2026, p.3",
      },
    ],
    summary:
      "The SAF 10% blend commitment is among the highest-risk claims in Petrovera\u2019s 2025-26 disclosure portfolio. Current production sits at 0.4%, the trajectory is implausible without disclosed supply agreements, no certification exists, and a regulator has opened a preliminary inquiry. Journalists should note that a promotional brochure \u2014 not a statutory disclosure \u2014 is the source of the headline figure, which has nonetheless been picked up by trade press.",
    evidence: [
      { id: "E-01", weight: 0.95, kind: "Database", title: "ICAO SAF Tracker \u2014 Petrovera supply",             org: "ICAO",                  date: "2026-04-10", quote: "Petrovera verified SAF delivery 2024: 48,000 tonnes (est. 0.4% blend). Industry leader: 2.1%.",        url: "icao.int/saf" },
      { id: "E-02", weight: 0.88, kind: "News",     title: "ACM opens inquiry into Petrovera SAF claims",          org: "Reuters",               date: "2026-03-14", quote: "Dutch consumer authority says it is examining whether Petrovera\u2019s SAF marketing meets substantiation standards.", url: "reuters.com" },
      { id: "E-03", weight: 0.76, kind: "Document", title: "Petrovera Aviation Solutions brochure Jan 2026",       org: "Petrovera Global plc",  date: "2026-01-15", quote: "Our SAF programme will achieve a 10% blend rate across our aviation fuel supply by 2030.",             url: "petrovera.com/aviation" },
      { id: "E-04", weight: 0.64, kind: "Database", title: "ISCC Certificate database \u2014 Petrovera entries",  org: "ISCC System GmbH",      date: "2026-04-01", quote: "No active ISCC PLUS or ISCC EU certificates on file for Petrovera Global plc.",                         url: "iscc-system.org" },
      { id: "E-05", weight: 0.52, kind: "Linguistic", title: "NLP audit \u2014 SAF brochure",                      org: "GWD analyzer v3.2",     date: "2026-05-23", quote: "Blend basis undefined. Geographic scope undefined. Feedstock undisclosed. Conditional language: 0 instances.", url: "internal" },
    ],
  },
  {
    id: "CLM-2026-0331-E",
    headline: "Methane intensity halved since 2017",
    shortQuote: "We have reduced our upstream methane intensity by more than 50% since 2017.",
    source: "Petrovera Sustainability Report 2025, p.18",
    sourceType: "Annual Report",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 48,
    riskLevel: "Medium Risk",
    confidence: 0.86,
    dimensionScores: {
      specificity: 7,
      data_consistency: 14,
      third_party_certification: 10,
      negative_news: 8,
      greenwashing_language: 9,
    },
    flags: [
      {
        type: "Data Contradiction",
        severity: "medium",
        description:
          "MethaneSAT satellite data for 2024 shows Petrovera\u2019s Permian operations emitting at 0.38% methane intensity vs. the company\u2019s self-reported 0.22%. Gap may reflect different asset boundary.",
        source: "MethaneSAT public dataset Q4 2024; Petrovera FY24 datasheet",
      },
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "Reduction measured on intensity (per unit of production) not absolute terms. Absolute methane emissions rose 4% in FY24 due to production growth.",
        source: "Petrovera FY24 emissions datasheet; OGMP 2.0 reporting",
      },
      {
        type: "Lack of Certification",
        severity: "low",
        description:
          "OGMP 2.0 Level 4 reporting covers approximately 70% of upstream assets. Remaining 30% reported at Level 2 (less granular).",
        source: "OGMP 2.0 Petrovera reporting status 2025",
      },
    ],
    summary:
      "Petrovera\u2019s methane intensity claim is substantiated in direction but carries meaningful measurement uncertainty. Third-party satellite data suggests a gap vs. self-reported figures that has not been reconciled publicly. The intensity metric also obscures absolute emission growth. The OGMP 2.0 reporting framework provides credibility, though incomplete coverage is a limitation. Worth citing with qualification on measurement methodology.",
    evidence: [
      { id: "E-01", weight: 0.88, kind: "Database", title: "MethaneSAT Q4 2024 \u2014 Petrovera Permian assets", org: "MethaneSAT LLC",         date: "2025-02-18", quote: "Observed methane intensity: 0.38% (vs. Petrovera self-reported 0.22%). Uncertainty band: \u00B10.04%.", url: "methanesat.org" },
      { id: "E-02", weight: 0.82, kind: "Document", title: "Petrovera Sustainability Report 2025 \u2014 p.18",    org: "Petrovera Global plc",  date: "2026-03-15", quote: "Upstream methane intensity 2024: 0.22% (2017: 0.45%). Reduction: 51%.",                              url: "petrovera.com/sustainability" },
      { id: "E-03", weight: 0.74, kind: "Filing",   title: "OGMP 2.0 Petrovera reporting status",                org: "OGMP 2.0 secretariat",  date: "2025-11-01", quote: "Petrovera Gold Pathway. Level 4 coverage: 71% of production. Level 2: 29%.",                          url: "ogmpartnership.com" },
      { id: "E-04", weight: 0.55, kind: "News",     title: "Satellite vs. self-reported methane: the gap",       org: "Nature Energy",         date: "2025-09-12", quote: "A systematic review of 40 operators finds self-reported methane intensity averages 42% below satellite-derived estimates.", url: "nature.com/nenergy" },
    ],
  },
  {
    id: "CLM-2026-0331-F",
    headline: "Operations powered by 35% renewable electricity",
    shortQuote: "Renewable electricity now accounts for 35% of our global operational energy consumption.",
    source: "Petrovera Annual Report 2025, p.44",
    sourceType: "Annual Report",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 33,
    riskLevel: "Medium Risk",
    confidence: 0.89,
    dimensionScores: {
      specificity: 5,
      data_consistency: 8,
      third_party_certification: 7,
      negative_news: 6,
      greenwashing_language: 7,
    },
    flags: [
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "35% figure blends on-site generation, direct PPAs, and unbundled RECs. RECs account for 61% of the claimed renewable volume and provide no additionality guarantee.",
        source: "Petrovera RE100 progress report 2025, p.6",
      },
      {
        type: "Data Contradiction",
        severity: "low",
        description:
          "RE100 dashboard shows Petrovera at 28% renewable electricity (methodology: RECs excluded from headline). Gap reflects definitional difference.",
        source: "RE100 Progress Report 2025 \u2014 Petrovera entry",
      },
      {
        type: "Greenwashing Language",
        severity: "low",
        description:
          "The phrase \u201Coperational energy consumption\u201D in the headline refers only to electricity, excluding process heat (76% of total energy). This framing is technically correct but misleading in context.",
        source: "Sustainability Report 2025, p.44, footnote 7",
      },
    ],
    summary:
      "Petrovera\u2019s 35% renewable electricity claim is broadly accurate but methodologically generous. The majority of claimed renewable volume relies on unbundled RECs, which sustainability standards increasingly regard as low-quality. Process heat is excluded, making electricity-only coverage figures appear larger relative to total energy. The RE100-adjusted figure of 28% is the more defensible headline.",
    evidence: [
      { id: "E-01", weight: 0.87, kind: "Database", title: "RE100 Progress Report 2025 \u2014 Petrovera",        org: "Climate Group / CDP",   date: "2025-10-22", quote: "Petrovera renewable electricity: 28% (RE100 methodology). Gap to self-reported 35%: REC treatment.", url: "there100.org" },
      { id: "E-02", weight: 0.78, kind: "Document", title: "Petrovera RE100 progress report 2025",               org: "Petrovera Global plc",  date: "2025-12-01", quote: "Renewable electricity mix FY24: on-site 9%, PPAs 30%, unbundled RECs 61%.",                         url: "petrovera.com/sustainability" },
      { id: "E-03", weight: 0.62, kind: "Filing",   title: "Annual Report 2025 \u2014 p.44",                     org: "Petrovera Global plc",  date: "2026-03-15", quote: "Renewable electricity now accounts for 35% of our global operational energy consumption.",            url: "petrovera.com/ir" },
    ],
  },
  {
    id: "CLM-2026-0331-G",
    headline: "Industry-leading water stewardship in stressed regions",
    shortQuote: "We are the industry leader in water stewardship across water-stressed operating regions.",
    source: "Petrovera Sustainability Report 2025, p.31",
    sourceType: "Annual Report",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 44,
    riskLevel: "Medium Risk",
    confidence: 0.80,
    dimensionScores: {
      specificity: 10,
      data_consistency: 12,
      third_party_certification: 9,
      negative_news: 6,
      greenwashing_language: 7,
    },
    flags: [
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "Self-designation as \u201Cindustry-leading\u201D without reference benchmark, peer set, or third-party ranking.",
        source: "Sustainability Report 2025, p.31",
      },
      {
        type: "Data Contradiction",
        severity: "medium",
        description:
          "CDP Water Security 2024 score: B-. Three IOC peers score A or A-, contradicting the \u201Cleading\u201D framing.",
        source: "CDP Water Security 2024 disclosure",
      },
      {
        type: "Greenwashing Language",
        severity: "medium",
        description:
          "Comparative superlative without comparator. Frequency: \u201Cleading\u201D appears 14 times in the sustainability report, never paired with a benchmark.",
        source: "Linguistic audit, NLP module v3.2",
      },
    ],
    summary:
      "The water stewardship claim is built on an unsupported comparative. Petrovera reports legitimate operational water programmes in the Permian and Arabian Peninsula, but its CDP Water Security rating (B-) trails three named peers (A/A-). Journalists should not repeat \u201Cindustry-leading\u201D framing without a benchmark; the underlying operational disclosures are reasonable to cite individually.",
    evidence: [
      { id: "E-01", weight: 0.88, kind: "Database",   title: "CDP Water Security 2024 \u2014 IOC league table",   org: "CDP Worldwide",            date: "2025-08-19", quote: "Petrovera: B-. Peer Z: A. Peer Y: A. Peer X: A-.",                                                              url: "cdp.net/water" },
      { id: "E-02", weight: 0.71, kind: "Document",   title: "Petrovera Sustainability Report 2025",              org: "Petrovera Global plc",     date: "2026-03-15", quote: "We are the industry leader in water stewardship across water-stressed operating regions.",                      url: "petrovera.com" },
      { id: "E-03", weight: 0.55, kind: "Database",   title: "Aqueduct Water Risk Atlas \u2014 Petrovera assets", org: "World Resources Institute", date: "2025-10-04", quote: "11 of 23 mapped Petrovera assets sit in extremely-high baseline water stress zones.",                          url: "wri.org/aqueduct" },
      { id: "E-04", weight: 0.39, kind: "Linguistic", title: "NLP audit \u2014 \u201Cleading\u201D pattern",      org: "GWD analyzer v3.2",        date: "2026-05-23", quote: "\u201CLeading\u201D appears 14 times; benchmark or comparator absent in all instances.",                      url: "internal" },
    ],
  },
  {
    id: "CLM-2026-0331-H",
    headline: "Zero routine flaring by 2030",
    shortQuote: "We have committed to end routine flaring across our operated assets by 2030.",
    source: "World Bank ZRF pledge; restated FY24 Annual Report",
    sourceType: "Public Pledge",
    capturedAt: "2026-03-31",
    analyzedAt: "2026-05-23 14:08 UTC",
    score: 41,
    riskLevel: "Medium Risk",
    confidence: 0.88,
    dimensionScores: {
      specificity: 6,
      data_consistency: 9,
      third_party_certification: 8,
      negative_news: 9,
      greenwashing_language: 9,
    },
    flags: [
      {
        type: "Vague Claims",
        severity: "medium",
        description:
          "Definition of \u201Croutine\u201D leaves emergency and safety-related flaring excluded. Coverage limited to operated assets (\u224862% of equity production).",
        source: "World Bank ZRF principles, applied",
      },
      {
        type: "Data Contradiction",
        severity: "medium",
        description:
          "Routine flaring volume in FY24: 4.1 bcm, only 12% below 2019 baseline. Linear trajectory to zero by 2030 implies a steep acceleration not yet observed.",
        source: "World Bank GGFR satellite data",
      },
      {
        type: "Lack of Certification",
        severity: "low",
        description:
          "Pledge is signed under World Bank ZRF initiative, providing some external structure, but no independent annual audit of progress.",
        source: "World Bank GGFR partnership",
      },
    ],
    summary:
      "Petrovera\u2019s zero-routine-flaring pledge is a credible-on-paper commitment with execution risk. The pledge is signed under the World Bank Zero Routine Flaring initiative and is therefore externally structured, but the company\u2019s flaring volumes have declined only modestly to date and the trajectory to 2030 implies a steeper reduction than has been demonstrated. The exclusion of non-operated assets is material given Petrovera\u2019s joint-venture exposure. Worth tracking annually rather than dismissing.",
    evidence: [
      { id: "E-01", weight: 0.92, kind: "Database", title: "World Bank GGFR Flaring Tracker \u2014 Petrovera", org: "World Bank GGFR",       date: "2026-02-28", quote: "Petrovera FY24 routine flaring: 4.1 bcm (2019: 4.7 bcm). Reduction trajectory: linear projection misses 2030 target by 1.6 bcm.", url: "worldbank.org/ggfr" },
      { id: "E-02", weight: 0.78, kind: "Filing",   title: "World Bank ZRF \u2014 endorsing companies list",    org: "World Bank",           date: "2022-05-10", quote: "Petrovera endorsed the Zero Routine Flaring by 2030 initiative on 10 May 2022.",                                                  url: "worldbank.org/zrf" },
      { id: "E-03", weight: 0.66, kind: "Document", title: "FY24 Annual Report \u2014 flaring disclosure",      org: "Petrovera Global plc", date: "2025-03-15", quote: "Routine flaring exclusions: emergency, safety, well testing under 30 days.",                                                  url: "petrovera.com/ir" },
      { id: "E-04", weight: 0.44, kind: "News",     title: "Joint-venture flaring not in headline targets",     org: "Reuters",              date: "2025-11-09", quote: "About 38% of Petrovera equity production sits in JVs outside the operated boundary used for flaring targets.",                  url: "reuters.com" },
    ],
  },
];

export const PIPELINE_STEPS = [
  { key: "fetch",   label: "Fetching company content",     detail: "Resolving petrovera.com\u2009/\u2009sustainability\u2009; following 4 in-bound links" },
  { key: "extract", label: "Extracting claims",            detail: "Parsing Sustainability Report 2025\u2009; 31 candidate claim spans identified" },
  { key: "enrich",  label: "Gathering external data",      detail: "EU ETS\u2009·\u2009CDP\u2009·\u2009OGMP 2.0\u2009·\u2009SBTi\u2009·\u2009MSCI\u2009·\u2009NewsAPI (12-month window)" },
  { key: "analyze", label: "Scoring against rubric",       detail: "Specificity\u2009·\u2009Data Consistency\u2009·\u2009Verification\u2009·\u2009Negative News\u2009·\u2009Language" },
  { key: "compose", label: "Composing credibility report", detail: "Drafting summary\u2009·\u2009ranking evidence\u2009·\u2009citing sources" },
];

export const GWD_DATA = { COMPANY, PEERS, WATCHLIST, RECENT_CLAIMS, CLAIMS, PIPELINE_STEPS };
