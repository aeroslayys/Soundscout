-- Invitation-based venue partner access and scheduled venue announcements.
-- All partner access is mediated by the trusted backend; no client RLS policies are added.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS time_zone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS venue_partner_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email = LOWER(email))
);
CREATE INDEX IF NOT EXISTS venue_partner_invites_email_idx
  ON venue_partner_invites (email, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_partner_invites_venue_idx
  ON venue_partner_invites (venue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS venue_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES venue_partner_invites(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, user_id)
);
CREATE INDEX IF NOT EXISTS venue_partners_user_idx
  ON venue_partners (user_id, active);
CREATE INDEX IF NOT EXISTS venue_partners_venue_idx
  ON venue_partners (venue_id, active);

CREATE TABLE IF NOT EXISTS venue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(160) NOT NULL,
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('live_music', 'dj_party', 'special_occasion', 'sports_screening', 'private_event', 'other')),
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  expected_crowd VARCHAR(16) NOT NULL DEFAULT 'unknown'
    CHECK (expected_crowd IN ('low', 'moderate', 'high', 'very_high', 'unknown')),
  amplified_music BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS venue_events_public_schedule_idx
  ON venue_events (venue_id, starts_at)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS venue_events_creator_idx
  ON venue_events (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS venue_event_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES venue_events(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(24) NOT NULL CHECK (action IN ('created', 'updated', 'cancelled')),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS venue_event_audit_event_idx
  ON venue_event_audit_logs (event_id, created_at DESC);

ALTER TABLE public.venue_partner_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_event_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.venue_partner_invites FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.venue_partners FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.venue_events FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.venue_event_audit_logs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.venue_event_audit_logs_id_seq FROM anon, authenticated;
