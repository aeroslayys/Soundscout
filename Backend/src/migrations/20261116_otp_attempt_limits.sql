ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS otp_codes_attempts_check;
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_attempts_check
  CHECK (attempts BETWEEN 0 AND 5);

CREATE INDEX IF NOT EXISTS otp_codes_active_email_created_idx
  ON public.otp_codes (email, created_at DESC)
  WHERE consumed_at IS NULL;
