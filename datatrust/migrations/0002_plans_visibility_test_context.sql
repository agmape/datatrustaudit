-- 0002: versioned commercial plan configuration, monthly usage with domains, admin test context,
-- subscription price snapshot. Additive only: existing users, audits and ledger rows are preserved.

CREATE TABLE plan_config_versions (
    id          TEXT PRIMARY KEY,
    version     INTEGER NOT NULL,
    config      TEXT NOT NULL,
    created_by  TEXT,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_plan_config_version UNIQUE (version)
);

CREATE TABLE admin_test_contexts (
    admin_id            TEXT PRIMARY KEY,
    plan                TEXT NOT NULL,
    quota_state         TEXT NOT NULL DEFAULT 'available',
    subscription_state  TEXT NOT NULL DEFAULT 'active',
    started_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL
);

ALTER TABLE credit_ledger ADD COLUMN domain TEXT;
ALTER TABLE credit_ledger ADD COLUMN plan TEXT;
ALTER TABLE credit_ledger ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ix_credit_user_created ON credit_ledger (user_id, created_at);

ALTER TABLE subscriptions ADD COLUMN current_period_start TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN price_cents INTEGER;
ALTER TABLE subscriptions ADD COLUMN currency TEXT;
ALTER TABLE subscriptions ADD COLUMN plan_config_version INTEGER;
ALTER TABLE subscriptions ADD COLUMN external_id TEXT;

ALTER TABLE audits ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
