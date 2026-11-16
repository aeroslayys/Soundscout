const crypto = require('crypto');
const pool = require('./db');

const UPSERT_SQL = `
  INSERT INTO public.auth_rate_limits (key_hash, window_started_at, hit_count, expires_at)
  VALUES ($1, NOW(), 1, NOW() + ($3::integer * INTERVAL '1 second'))
  ON CONFLICT (key_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN auth_rate_limits.window_started_at + ($3::integer * INTERVAL '1 second') <= NOW()
      THEN NOW() ELSE auth_rate_limits.window_started_at END,
    hit_count = CASE
      WHEN auth_rate_limits.window_started_at + ($3::integer * INTERVAL '1 second') <= NOW()
      THEN 1 ELSE LEAST(auth_rate_limits.hit_count + 1, $2::integer + 1) END,
    expires_at = CASE
      WHEN auth_rate_limits.window_started_at + ($3::integer * INTERVAL '1 second') <= NOW()
      THEN NOW() + ($3::integer * INTERVAL '1 second') ELSE auth_rate_limits.expires_at END
  RETURNING key_hash, window_started_at::text AS window_started_at, hit_count,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
      window_started_at + ($3::integer * INTERVAL '1 second') - NOW()
    ))))::integer AS retry_after_seconds
`;

function createOtpRateLimiter(databasePool, secret = process.env.JWT_SECRET) {
  if (!secret) throw new Error('JWT_SECRET is required to initialize OTP rate limiting.');

  function hashKey(key) {
    return crypto.createHmac('sha256', secret).update(key).digest('hex');
  }

  return {
    async consume(key, limit, windowSeconds) {
      const keyHash = hashKey(key);
      const result = await databasePool.query(UPSERT_SQL, [keyHash, limit, windowSeconds]);
      const row = result.rows[0];
      const reservation = { keyHash, windowStartedAt: row.window_started_at };
      return {
        allowed: Number(row.hit_count) <= limit,
        retryAfterSeconds: Number(row.retry_after_seconds),
        reservation,
      };
    },

    async release(reservation) {
      if (!reservation) return;
      const params = [reservation.keyHash, reservation.windowStartedAt];
      await databasePool.query(
        `UPDATE public.auth_rate_limits SET hit_count = hit_count - 1
         WHERE key_hash = $1 AND window_started_at = $2 AND hit_count > 1`,
        params
      );
      await databasePool.query(
        `DELETE FROM public.auth_rate_limits
         WHERE key_hash = $1 AND window_started_at = $2 AND hit_count = 1`,
        params
      );
    },

    startCleanup(intervalMs = 60 * 60 * 1000) {
      const timer = setInterval(() => {
        databasePool.query('DELETE FROM public.auth_rate_limits WHERE expires_at <= NOW()')
          .catch(() => console.error('[SoundScout] OTP rate-limit cleanup failed.'));
      }, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}

const limiter = createOtpRateLimiter(pool);
limiter.createOtpRateLimiter = createOtpRateLimiter;
module.exports = limiter;
