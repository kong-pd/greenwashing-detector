# GreenCheck — ESG Greenwashing Detector

> ImagineHack 2026 · A Sustainable Tomorrow · Taylor's University

An AI-powered ESG fact-checking engine that cross-references corporate sustainability claims against verified external data and produces a structured credibility report.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| Git | Any |

---

## First-Time Setup

### 1. Clone the repository

```bash
git clone https://github.com/kong-pd/greenwashing-detector.git
cd greenwashing-detector
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in all values:

```
SUPABASE_URL=https://iedtlyxlnenfldogvhen.supabase.co
SUPABASE_ANON_KEY=your_publishable_key
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
NEWS_API_KEY=your_newsapi_key
ANALYSIS_SERVICE_URL=http://localhost:8001
USE_MOCK=false
```

### 3. Set up the database

Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**.
Paste the contents of `database/schema.sql` and click **Run**.

### 4. Install backend dependencies

```bash
# Create and activate virtual environment (do this once)
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Install Playwright browser

```bash
playwright install chromium
```

### 6. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Running the System

You need **three terminals** running simultaneously.

### Terminal 1 — Backend (web-service)

```bash
# From project root, with venv activated
cd backend
uvicorn main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Terminal 2 — Analysis Service

```bash
# From project root, with venv activated
cd analysis
uvicorn main:app --reload --port 8001
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8001
INFO:     Application startup complete.
```

### Terminal 3 — Frontend

```bash
cd frontend
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser.

---

## Subsequent Runs

Once installed, you only need to run the three `uvicorn` / `npm run dev` commands — no reinstallation needed.

```bash
# Terminal 1 — activate venv first
.\venv\Scripts\activate          # Windows
source venv/bin/activate         # macOS/Linux
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd analysis && uvicorn main:app --reload --port 8001

# Terminal 3
cd frontend && npm run dev
```

---

## Environment Variables Reference

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `SUPABASE_URL` | Supabase project URL | Supabase → Settings → General → Project ID → `https://{id}.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase publishable key | Supabase → Settings → API Keys → Publishable key |
| `ANTHROPIC_API_KEY` | Claude API key | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `GEMINI_API_KEY` | Gemini API key (fallback) | [aistudio.google.com](https://aistudio.google.com) → Get API Key |
| `NEWS_API_KEY` | NewsAPI key | [newsapi.org](https://newsapi.org) → Register → your key |
| `ANALYSIS_SERVICE_URL` | URL of analysis service | `http://localhost:8001` (local) or Railway URL (deployed) |
| `USE_MOCK` | Emergency fallback mode | Set to `true` to bypass all external APIs |

---

## Fault Tolerance

The system has multiple fallback layers — the demo always completes:

| Scenario | What Happens |
|----------|-------------|
| Claude API unavailable | Auto-switches to Gemini |
| Both AIs unavailable | Returns pre-computed result from `analysis/local_cache.json` |
| Company not in local cache | Returns generic mock report |
| NewsAPI unavailable | Analysis continues with empty evidence list |
| Scraper blocked | Frontend switches to manual input mode |
| Supabase unavailable | Reads from local cache; writes skipped gracefully |

### Emergency: force mock mode

If all APIs are unavailable, set `USE_MOCK=true` in `.env` and restart the analysis service:

```bash
# In .env
USE_MOCK=true

# Restart analysis service
cd analysis
uvicorn main:app --reload --port 8001
```

---

## Project Structure

```
greenwashing-detector/
│
├── backend/                    # web-service (FastAPI, port 8000)
│   ├── main.py                 # App entry point
│   ├── routes/
│   │   └── analyze.py          # /api/analyze, /api/report, /api/history
│   ├── db/
│   │   └── supabase.py         # DB operations with local cache fallback
│   └── pdf/
│       └── generator.py        # PDF export
│
├── analysis/                   # analysis-service (FastAPI, port 8001)
│   ├── main.py                 # Service entry point + job processor
│   ├── scraper.py              # Playwright ESG page scraper
│   ├── enricher.py             # NewsAPI → structured evidence objects
│   ├── analyzer.py             # Claude/Gemini/cache/mock fallback chain
│   └── local_cache.json        # Pre-computed results for demo companies
│
├── frontend/                   # React + Vite (port 5173)
│   └── src/
│       ├── App.jsx             # Main shell and routing
│       ├── screens/
│       │   ├── AnalysisScreen.jsx
│       │   └── ReportScreen.jsx
│       ├── components/
│       │   ├── SharedComponents.jsx
│       │   ├── TweaksPanel.jsx
│       │   └── Interactions.jsx
│       ├── data.js             # Demo data (Petrovera Global)
│       └── index.css           # Design tokens and global styles
│
├── database/
│   └── schema.sql              # Supabase table definitions
│
├── .env.example                # Environment variable template
├── requirements.txt            # Python dependencies
└── README.md
```

---

## Health Checks

Verify all services are running:

```bash
# Backend
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# Analysis service
curl http://localhost:8001/health
# Expected: {"status":"started"} or similar

# Frontend
# Open http://localhost:5173 in browser
```

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `pip install` encoding error | `requirements.txt` not UTF-8 | Save file as UTF-8 in a text editor |
| `uvicorn` not found | venv not activated | Run `.\venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux) |
| `localhost:5173` shows 404 | `index.html` or `main.jsx` missing | Ensure `frontend/index.html` and `frontend/src/main.jsx` exist |
| Analysis always fails | API keys not set | Check `.env` has all required keys |
| Supabase connection error | Wrong URL or key | Confirm `SUPABASE_URL` format: `https://{project-id}.supabase.co` |
| `venv/` pushed to GitHub | `.gitignore` missing entry | Run `git rm -r --cached venv/` then commit |

---

## Team

| Member | Responsibility |
|--------|---------------|
| Person A | Frontend (React + Vite) |
| Person B | Backend API + Database |
| Person C | Scraper + AI Analysis |
