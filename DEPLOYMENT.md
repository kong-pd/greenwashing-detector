# GreenCheck — Deployment Guide
## Vercel (Frontend) + Railway (Backend × 2)

---

## 1. Railway — Backend Service (port 8000)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `kong-pd/greenwashing-detector`, **Root Directory**: `backend`
3. Railway auto-detects the `Procfile` → `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add Environment Variables (Settings → Variables):

```
SUPABASE_URL=https://iedtlyxlnenfldogvhen.supabase.co
SUPABASE_ANON_KEY=your_key
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
NEWS_API_KEY=your_key
ANALYSIS_SERVICE_URL=https://YOUR_ANALYSIS_RAILWAY_URL
USE_MOCK=false
```

5. Copy the generated Railway URL (e.g. `https://greencheck-backend.up.railway.app`)

---

## 2. Railway — Analysis Service (port 8001)

1. New Project → Deploy from same repo, **Root Directory**: `analysis`
2. Procfile: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Environment Variables:

```
SUPABASE_URL=https://iedtlyxlnenfldogvhen.supabase.co
SUPABASE_ANON_KEY=your_key
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
NEWS_API_KEY=your_key
USE_MOCK=false
```

4. Copy this URL → paste as `ANALYSIS_SERVICE_URL` in the **backend** service above.

---

## 3. Vercel — Frontend

1. Go to [vercel.com](https://vercel.com) → New Project → Import `kong-pd/greenwashing-detector`
2. **Root Directory**: `frontend`
3. Build settings are auto-detected from `vercel.json`
4. Edit `frontend/vercel.json` — replace `YOUR_RAILWAY_BACKEND_URL` with the backend Railway URL from step 1
5. No environment variables needed (proxy handles API routing)
6. Deploy → copy Vercel URL

---

## 4. CORS Update

In `backend/main.py`, update `allow_origins` before deploying:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://YOUR_VERCEL_URL.vercel.app",
        "http://localhost:5173",  # keep for local dev
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 5. Supabase Database

Run `database/schema.sql` in Supabase SQL Editor if not already done.
Run `database/migration.sql` if upgrading from v1.

---

## Health Check URLs (after deploy)

```
# Backend
curl https://YOUR_BACKEND.up.railway.app/health
# → {"status":"ok"}

# Analysis
curl https://YOUR_ANALYSIS.up.railway.app/health
# → {"status":"ok","service":"analysis"}

# Frontend
open https://YOUR_PROJECT.vercel.app
```

---

## Demo Flow (ImagineHack presentation)

1. Open the Vercel URL
2. Search for **"Shell"** → see High Risk 78/100 from local cache (instant, no API needed)
3. Search for **"Patagonia"** → see Low Risk 18/100 contrast
4. Click **Open report** → show §2 dimension bars with TCFD / GRI / EU badges (FR-34)
5. Click **Show full rubric table** → show §5 methodology with 5-standard alignment
6. Open **Evidence trail** → show weighted sources
7. Search **"BP"** → High Risk 74/100
8. Export PDF → institutional report
