CREATE TABLE analysis_jobs (
    id              TEXT PRIMARY KEY,
    company_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing',
    step            TEXT,
    fail_reason     TEXT,
    score           INTEGER,
    risk_level      TEXT,
    summary         TEXT,
    sources         JSONB,
    raw_content     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE analysis_flags (
    id          SERIAL PRIMARY KEY,
    job_id      TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    source      TEXT
);

CREATE TABLE cached_companies (
    company_name    TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES analysis_jobs(id),
    cached_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);