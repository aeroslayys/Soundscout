CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  age SMALLINT NOT NULL CHECK (age > 0 AND age < 120),
  sensitivity SMALLINT NOT NULL CHECK (sensitivity BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('signup', 'login')),
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email, consumed_at, expires_at);

-- Needed for gen_random_uuid() above, run once per database:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase auto-exposes every table via a public REST API using an "anon" key.
-- This app never uses that API (the Express backend connects directly via
-- DATABASE_URL, which bypasses RLS as the table owner), so enabling RLS here
-- with no policies simply blocks Supabase's auto-API from touching these
-- tables at all — a safety net in case the anon key ever leaks.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;