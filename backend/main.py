from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Route imports load DB configuration at module scope, so dotenv must be
# populated first (CACHE_TTL_HOURS / SUPABASE_TIMEOUT_SECONDS included).
from routes.analyze import router as analyze_router

app = FastAPI(title="Greenwashing Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict to frontend domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}
