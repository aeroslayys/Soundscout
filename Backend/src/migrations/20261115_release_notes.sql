CREATE TABLE IF NOT EXISTS public.release_notes (
  id BIGSERIAL PRIMARY KEY,
  version VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS release_notes_version_unique ON public.release_notes(version);
CREATE INDEX IF NOT EXISTS release_notes_published_idx
  ON public.release_notes(published_at DESC, id DESC)
  WHERE status = 'published';
ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.release_notes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.release_notes_id_seq FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.release_notes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.release_notes_id_seq TO service_role;
