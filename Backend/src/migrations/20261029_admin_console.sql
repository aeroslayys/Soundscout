-- SoundScout admin console migration
-- Apply this file once to the same PostgreSQL database used by Backend/src/db.js.
-- Existing venues stay approved; new venue submissions can be moderated.

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(16) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_approval_status_check;
ALTER TABLE venues
  ADD CONSTRAINT venues_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS ratings_active_venue_idx
  ON ratings (venue_id, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ratings_deleted_idx
  ON ratings (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_approval_status_idx
  ON venues (approval_status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_suspended_idx
  ON users (is_suspended);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON admin_audit_logs (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id BIGSERIAL PRIMARY KEY,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(24) NOT NULL CHECK (target_type IN ('rating', 'venue')),
  target_id TEXT NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_flags_status_created_idx
  ON moderation_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_flags_target_idx
  ON moderation_flags (target_type, target_id);

-- Ensure legacy venues remain approved, while preserving any status already set.
UPDATE venues SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status = '';

-- Soft-deleted ratings remain in the database for audit/restore, but must not
-- be included in public rating summaries.
