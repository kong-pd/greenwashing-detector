-- ============================================================
-- GreenCheck · database/schema.sql  (v2 — canonical)
-- Run this on a fresh Supabase project.
-- For existing tables, use database/migration_v2.sql instead.
-- ============================================================

-- ── analysis_jobs ─────────────────────────────────────────────────────────────
-- One row per analysis run. Starts as "processing", ends as "completed"/"failed".
-- Sources (JSONB) stores the full evidence object array from the AI.
-- dimension_scores (JSONB) stores the five 0–20 scores.

CREATE TABLE IF NOT EXISTS analysis_jobs (
    id               TEXT        PRIMARY KEY,
    company_name     TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'processing',
    step             TEXT,                          -- human-readable pipeline step
    fail_reason      TEXT,
    score            INTEGER,                       -- 0–100
    risk_level       TEXT,                          -- 'Low Risk' | 'Medium Risk' | 'High Risk'
    confidence       NUMERIC(4,3),                  -- nullable model-reported 0–1 value
    model_used       TEXT,                          -- provider/model label selected by fallback chain
    model_layer      SMALLINT,                      -- 1-based fallback layer
    rubric_version   TEXT,                          -- scoring rubric used for this run
    summary          TEXT,
    sources          JSONB,                         -- full evidence object array
    dimension_scores JSONB,                         -- { specificity, data_consistency, ... }
    raw_content      TEXT,                          -- scraped ESG page text (debug)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

-- ── analysis_flags ────────────────────────────────────────────────────────────
-- One row per flag per job (typically 3 flags per completed job).
-- severity: 'high' | 'medium' | 'low'

CREATE TABLE IF NOT EXISTS analysis_flags (
    id          SERIAL      PRIMARY KEY,
    job_id      TEXT        NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    type        TEXT        NOT NULL,              -- 'Vague Claims' | 'Data Contradiction' | ...
    severity    TEXT        NOT NULL DEFAULT 'medium',
    description TEXT        NOT NULL,
    source      TEXT
);

-- ── cached_companies ──────────────────────────────────────────────────────────
-- Optional explicit cache: maps a company name to a canonical completed job.
-- Used to permanently pin a company to a specific analysis result.
-- Note: the backend also checks analysis_jobs directly for completed jobs,
-- so this table is only needed for manual overrides.

CREATE TABLE IF NOT EXISTS cached_companies (
    company_name TEXT        PRIMARY KEY,
    job_id       TEXT        NOT NULL REFERENCES analysis_jobs(id),
    cached_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jobs_status      ON analysis_jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_company     ON analysis_jobs (company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_completed   ON analysis_jobs (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_flags_job_id     ON analysis_flags (job_id);
CREATE INDEX IF NOT EXISTS idx_cache_company    ON cached_companies (company_name);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run this after setup to confirm all columns exist:
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'analysis_jobs'
-- ORDER BY ordinal_position;
--
-- Expected columns:
--   id, company_name, status, step, fail_reason, score, risk_level,
--   confidence, model_used, model_layer, rubric_version, summary, sources,
--   dimension_scores, raw_content, created_at, completed_at
