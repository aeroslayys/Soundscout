-- Opt-in product announcements and signup source tracking.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_platform VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS announcement_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS announcement_unsubscribe_token VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS announcement_unsubscribed_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_signup_platform_check;
ALTER TABLE users ADD CONSTRAINT users_signup_platform_check
  CHECK (signup_platform IN ('web', 'android', 'unknown'));

CREATE INDEX IF NOT EXISTS users_announcement_opt_in_idx
  ON users (created_at) WHERE announcement_opt_in = TRUE AND is_suspended = FALSE;

CREATE TABLE IF NOT EXISTS announcement_campaigns (
  id BIGSERIAL PRIMARY KEY,
  subject VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES announcement_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(12) NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS announcement_campaigns_created_idx ON announcement_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS announcement_deliveries_campaign_idx ON announcement_deliveries (campaign_id, status);

-- RLS with no client policies: only the trusted backend database role can access these tables.
ALTER TABLE public.announcement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
