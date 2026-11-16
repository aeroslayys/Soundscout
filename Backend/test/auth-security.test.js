const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const crypto = require('node:crypto');

process.env.JWT_SECRET = 'test-only-jwt-signing-key-at-least-32-bytes-long';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '1';
process.env.OTP_EMAIL_REQUEST_LIMIT_PER_HOUR = '5';
process.env.OTP_REQUEST_IP_LIMIT_PER_HOUR = '3';
process.env.OTP_VERIFY_IP_LIMIT_PER_15_MINUTES = '6';
let nextCode = 100000;
const originalRandomInt = crypto.randomInt;
crypto.randomInt = (min, max) => {
  if (min === 0 && max === 1000000) return ++nextCode;
  return originalRandomInt(min, max);
};

const buckets = new Map();
const otps = new Map();
let failRateStore = false;
let nextOtpId = 1;

const pool = {
  async query(sql, params = []) {
    if (sql.includes('INSERT INTO public.auth_rate_limits')) {
      if (failRateStore) throw new Error('database connection detail must not reach HTTP');
      const [keyHash, limit, windowSeconds] = params;
      const now = Date.now();
      let bucket = buckets.get(keyHash);
      if (!bucket || now - bucket.startedAt >= windowSeconds * 1000) {
        bucket = { startedAt: now, count: 0 };
        buckets.set(keyHash, bucket);
      }
      bucket.count = Math.min(bucket.count + 1, limit + 1);
      return {
        rows: [{
          key_hash: keyHash,
          window_started_at: new Date(bucket.startedAt).toISOString(),
          hit_count: bucket.count,
          retry_after_seconds: Math.max(1, Math.ceil((bucket.startedAt + windowSeconds * 1000 - now) / 1000)),
        }],
      };
    }
    if (sql.includes('UPDATE public.auth_rate_limits SET hit_count = hit_count - 1')) {
      const bucket = buckets.get(params[0]);
      if (bucket && bucket.startedAt === new Date(params[1]).getTime() && bucket.count > 1) {
        bucket.count -= 1;
      }
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('DELETE FROM public.auth_rate_limits')) {
      const bucket = buckets.get(params[0]);
      if (bucket && bucket.startedAt === new Date(params[1]).getTime() && bucket.count === 1) {
        buckets.delete(params[0]);
      }
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('SELECT id FROM users WHERE LOWER(email)')) {
      return { rowCount: 1, rows: [{ id: 'user-1' }] };
    }
    if (sql.includes('UPDATE otp_codes SET consumed_at = NOW()') && sql.includes('LOWER(email)')) {
      const otp = otps.get(params[0]);
      if (otp) otp.consumed = true;
      return { rowCount: otp ? 1 : 0, rows: [] };
    }
    if (sql.includes('INSERT INTO otp_codes')) {
      otps.set(params[0], {
        id: nextOtpId++, email: params[0], code_hash: params[1], purpose: params[2],
        expires_at: params[3], attempts: 0, consumed: false,
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  },
  async connect() {
    return {
      async query(sql, params = []) {
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rowCount: 0, rows: [] };
        if (sql.includes('SELECT id, code_hash, purpose, attempts FROM otp_codes')) {
          const otp = otps.get(params[0]);
          const active = otp && !otp.consumed && otp.expires_at > new Date();
          return { rowCount: active ? 1 : 0, rows: active ? [otp] : [] };
        }
        if (sql.includes('UPDATE otp_codes SET attempts = attempts + 1')) {
          const otp = [...otps.values()].find(candidate => candidate.id === params[0]);
          otp.attempts += 1;
          if (otp.attempts >= 5) otp.consumed = true;
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1')) {
          const otp = [...otps.values()].find(candidate => candidate.id === params[0]);
          if (otp) otp.consumed = true;
          return { rowCount: otp ? 1 : 0, rows: [] };
        }
        if (sql.includes('SELECT id, email, name, age, sensitivity, is_suspended FROM users')) {
          return {
            rowCount: 1,
            rows: [{ id: 'user-1', email: params[0], name: 'Test User', age: 30, sensitivity: 3, is_suspended: false }],
          };
        }
        throw new Error(`Unexpected client query: ${sql}`);
      },
      release() {},
    };
  },
};

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const sentCodes = [];
const mailerPath = require.resolve('../src/mailer');
require.cache[mailerPath] = {
  id: mailerPath, filename: mailerPath, loaded: true,
  exports: { sendOtpEmail: async (email, code) => sentCodes.push({ email, code }) },
};
const express = require('express');
const authRoutes = require('../src/routes/auth');
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/auth', authRoutes);
const server = app.listen(0, '127.0.0.1');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function post(route, body, ip = '198.51.100.1') {
  return fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

before(() => new Promise(resolve => server.once('listening', resolve)));
after(async () => {
  await new Promise(resolve => server.close(resolve));
  crypto.randomInt = originalRandomInt;
});

test('invalid emails are rejected and resend cooldown returns retry metadata', async () => {
  const invalid = await post('request-otp', { email: 'not-an-email' });
  assert.equal(invalid.status, 400);
  const invalidVerify = await post('verify-otp', { email: 'still-not-an-email', code: '123456' });
  assert.equal(invalidVerify.status, 400);
  const first = await post('request-otp', { email: 'cooldown@example.test' });
  assert.equal(first.status, 200);
  const repeated = await post('request-otp', { email: 'cooldown@example.test' });
  assert.equal(repeated.status, 429);
  assert.ok(Number(repeated.headers.get('retry-after')) >= 1);
  assert.ok((await repeated.json()).retryAfterSeconds >= 1);
});

test('per-IP request limit blocks requests for different addresses', async () => {
  for (let i = 0; i < 3; i++) {
    const response = await post('request-otp', { email: `ip-${i}@example.test` }, '198.51.100.20');
    assert.equal(response.status, 200);
  }
  const limited = await post('request-otp', { email: 'ip-over@example.test' }, '198.51.100.20');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
});

test('per-email hourly limit caps fresh OTP resets at five', async () => {
  const email = 'hourly@example.test';
  for (let i = 0; i < 5; i++) {
    if (i) await sleep(1050);
    const response = await post('request-otp', { email }, `198.51.100.${30 + i}`);
    assert.equal(response.status, 200);
  }
  await sleep(1050);
  const limited = await post('request-otp', { email }, '198.51.100.39');
  assert.equal(limited.status, 429);
  assert.ok((await limited.json()).retryAfterSeconds > 0);
});

test('five wrong OTP attempts consume the code; fresh requests remain hourly-limited', async () => {
  const email = 'attempts@example.test';
  assert.equal((await post('request-otp', { email }, '198.51.100.40')).status, 200);
  const firstCode = sentCodes.at(-1).code;
  const wrongCode = firstCode === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) {
    const response = await post('verify-otp', { email, code: wrongCode }, '198.51.100.41');
    assert.equal(response.status, 401);
  }
  assert.equal(otps.get(email).attempts, 5);
  assert.equal(otps.get(email).consumed, true);
  assert.equal((await post('verify-otp', { email, code: firstCode }, '198.51.100.41')).status, 401);

  for (let i = 1; i < 5; i++) {
    await sleep(1050);
    assert.equal((await post('request-otp', { email }, `198.51.100.${41 + i}`)).status, 200);
  }
  await sleep(1050);
  assert.equal((await post('request-otp', { email }, '198.51.100.49')).status, 429);
  assert.equal((await post('verify-otp', { email, code: firstCode }, '198.51.100.41')).status, 429);
});

test('a fresh OTP invalidates the previous code and verifies successfully', async () => {
  const email = 'success@example.test';
  assert.equal((await post('request-otp', { email }, '198.51.100.50')).status, 200);
  const staleCode = sentCodes.at(-1).code;
  await sleep(1050);
  assert.equal((await post('request-otp', { email }, '198.51.100.50')).status, 200);
  const currentCode = sentCodes.at(-1).code;
  assert.equal((await post('verify-otp', { email, code: staleCode }, '198.51.100.51')).status, 401);
  const response = await post('verify-otp', { email, code: currentCode }, '198.51.100.51');
  assert.equal(response.status, 200);
  assert.ok((await response.json()).token);
  assert.equal(otps.get(email).consumed, true);
});

test('rate-store connection failures return a generic service error', async () => {
  failRateStore = true;
  try {
    const response = await post('request-otp', { email: 'unavailable@example.test' }, '198.51.100.60');
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /database connection detail/);
  } finally {
    failRateStore = false;
  }
});
