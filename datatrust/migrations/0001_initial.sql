-- 0001_initial: accounts, plans, audits, credits, admin log.
-- Portable between SQLite (development) and PostgreSQL/Supabase (production).
-- Ids are TEXT (UUID strings; profiles.id is the verified auth.users UUID).

CREATE TABLE profiles (
    id            TEXT PRIMARY KEY,
    email         TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ NOT NULL,
    last_seen_at  TIMESTAMPTZ
);

CREATE TABLE subscriptions (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    plan               TEXT NOT NULL,
    status             TEXT NOT NULL,
    current_period_end TIMESTAMPTZ,
    source             TEXT,
    created_at         TIMESTAMPTZ NOT NULL,
    updated_at         TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_subscriptions_user ON subscriptions (user_id);

CREATE TABLE audits (
    id              TEXT PRIMARY KEY,
    user_id         TEXT,
    url             TEXT NOT NULL,
    domain          TEXT,
    mode            TEXT NOT NULL,
    status          TEXT NOT NULL,
    error_code      TEXT,
    language        TEXT,
    engine_version  TEXT,
    scoring_version TEXT,
    plan_at_run     TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    runtime_observed INTEGER,
    findings_count  INTEGER,
    report_gz_b64   TEXT
);
CREATE INDEX ix_audits_user_created ON audits (user_id, created_at);
CREATE INDEX ix_audits_status ON audits (status);

CREATE TABLE credit_ledger (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    audit_id     TEXT NOT NULL,
    state        TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    reason       TEXT,
    CONSTRAINT uq_credit_audit UNIQUE (audit_id)
);
CREATE INDEX ix_credit_user_period ON credit_ledger (user_id, period_start);

CREATE TABLE admin_audit_log (
    id         TEXT PRIMARY KEY,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,
    target     TEXT,
    details    TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
