# Greenwashing Detector

> ImagineHack 2026 · A Sustainable Tomorrow · Taylor's University

An AI-powered ESG fact-checking engine that automatically analyses corporate sustainability claims and generates a credibility report.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- `.env` file configured (see `.env.example`)

### Backend (web-service)
```bash
cd backend
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8000
```

### Analysis Service
```bash
cd analysis
playwright install chromium
uvicorn main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GEMINI_API_KEY` | Gemini API key (fallback) |
| `NEWS_API_KEY` | NewsAPI key |
| `ANALYSIS_SERVICE_URL` | URL of the analysis service |
| `USE_MOCK` | Set to `true` to enable mock mode (emergency fallback) |

---

## Project Structure

```
├── backend/           # web-service (FastAPI)
│   ├── routes/        # API routes
│   ├── db/            # Supabase operations
│   └── pdf/           # PDF generation
├── analysis/          # analysis-service
│   ├── scraper.py     # Playwright web scraper
│   ├── enricher.py    # NewsAPI + CDP data
│   └── analyzer.py    # AI scoring engine
├── frontend/          # React + Vite
│   └── src/
│       ├── pages/
│       ├── components/
│       └── api/
├── .env.example
├── requirements.txt
└── README.md
```

---

## Team

| Member | Responsibility |
|--------|---------------|
| Person A | Frontend |
| Person B | Backend API + Database |
| Person C | Scraper + AI Analysis |
