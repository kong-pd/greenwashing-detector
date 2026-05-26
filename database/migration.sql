-- ============================================================
-- GreenCheck · Migration v2
-- Run this if you already applied the original schema.sql
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- 1. Add missing column
ALTER TABLE analysis_jobs
    ADD COLUMN IF NOT EXISTS dimension_scores JSONB;

-- 2. Add severity column to flags (was missing in v1)
ALTER TABLE analysis_flags
    ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium';

-- 3. Add indexes (harmless if they already exist)
CREATE INDEX IF NOT EXISTS idx_jobs_status    ON analysis_jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_company   ON analysis_jobs (company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_completed ON analysis_jobs (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_flags_job_id   ON analysis_flags (job_id);
CREATE INDEX IF NOT EXISTS idx_cache_company  ON cached_companies (company_name);

-- Verify the columns are now present:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'analysis_jobs'
-- ORDER BY ordinal_position;
