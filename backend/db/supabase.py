import os
from supabase import create_client

def get_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])

def create_job(job_id: str, company_name: str):
    get_client().table("analysis_jobs").insert({
        "id": job_id,
        "company_name": company_name,
        "status": "processing",
        "step": "Initializing..."
    }).execute()

def get_job(job_id: str):
    res = get_client().table("analysis_jobs") \
        .select("*, analysis_flags(*)") \
        .eq("id", job_id).single().execute()
    return res.data

def get_cached_company(company_name: str):
    res = get_client().table("cached_companies") \
        .select("*").eq("company_name", company_name).maybe_single().execute()
    return res.data

def get_history():
    res = get_client().table("analysis_jobs") \
        .select("id, company_name, score, risk_level, completed_at") \
        .eq("status", "completed") \
        .order("completed_at", desc=True) \
        .limit(10).execute()
    return res.data
