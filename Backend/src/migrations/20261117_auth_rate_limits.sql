CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count > 0),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_expires_at_idx
  ON public.auth_rate_limits (expires_at);
