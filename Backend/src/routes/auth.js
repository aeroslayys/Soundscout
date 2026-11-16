const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendOtpEmail } = require('../mailer');

const router = express.Router();

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 30);

// In-memory cooldown tracker (swap for Redis if you scale past one instance)
const lastSentAt = new Map();

function generateOtp() {
  // 6-digit numeric code, zero-padded
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length <= 255 &&
    /^[^\s@<>()[\]{},"']+@[^\s@<>()[\]{},"']+\.[^\s@<>()[\]{},"']+$/.test(email.trim());
}

// POST /api/auth/request-otp
// body: { email }
// Sends a fresh OTP by email. Tells the frontend whether this email is new
// (so it knows to show the name/age/sensitivity fields) or returning.
router.post('/request-otp', async (req, res) => {
  const emailInput = req.body?.email;

  if (!isValidEmail(emailInput)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const email = emailInput.trim().toLowerCase();
  const now = Date.now();
  for (const [key, sentAt] of lastSentAt) {
    if (now - sentAt >= RESEND_COOLDOWN_SECONDS * 1000) lastSentAt.delete(key);
  }
  const cooldownKey = email;
  const lastSent = lastSentAt.get(cooldownKey);
  if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_SECONDS * 1000) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSeconds}s before requesting another code.` });
  }
  lastSentAt.set(cooldownKey, now);
  while (lastSentAt.size > 10000) lastSentAt.delete(lastSentAt.keys().next().value);

  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    const isNewUser = existingUser.rowCount === 0;
    const purpose = isNewUser ? 'signup' : 'login';

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `UPDATE otp_codes SET consumed_at = NOW()
       WHERE LOWER(email) = $1 AND consumed_at IS NULL`,
      [email]
    );
    await pool.query(
      `INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [email, codeHash, purpose, expiresAt]
    );

    await sendOtpEmail(email, code, { isNewUser });

    return res.json({ isNewUser, expiresInMinutes: OTP_EXPIRY_MINUTES });
  } catch (err) {
    if (lastSentAt.get(cooldownKey) === now) lastSentAt.delete(cooldownKey);
    console.error('request-otp error:', err);
    return res.status(500).json({ error: 'Could not send verification code. Try again shortly.' });
  }
});


// POST /api/auth/verify-otp
// body for returning users: { email, code }
// body for new users:       { email, code, name, age, sensitivity }
router.post('/verify-otp', async (req, res) => {
  const { code, name, age, sensitivity } = req.body || {};
  const emailInput = req.body?.email;

  if (!isValidEmail(emailInput) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter a valid email address and 6-digit code.' });
  }

  const email = emailInput.trim().toLowerCase();
  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;
    const otpResult = await client.query(
      `SELECT id, code_hash, purpose, attempts FROM otp_codes
       WHERE LOWER(email) = $1 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [email]
    );

    if (!otpResult.rowCount) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(401).json({ error: 'Code expired or not found. Request a new one.' });
    }

    const otpRow = otpResult.rows[0];
    if (otpRow.attempts >= 5) {
      await client.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otpRow.id]);
      await client.query('COMMIT');
      inTransaction = false;
      return res.status(401).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    if (!await bcrypt.compare(code, otpRow.code_hash)) {
      await client.query(
        `UPDATE otp_codes SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
         WHERE id = $1`,
        [otpRow.id]
      );
      await client.query('COMMIT');
      inTransaction = false;
      return res.status(401).json({ error: 'Incorrect code.' });
    }

    const existing = await client.query(
      'SELECT id, email, name, age, sensitivity, is_suspended FROM users WHERE LOWER(email) = $1',
      [email]
    );

    let user;
    if (existing.rowCount) {
      user = existing.rows[0];
    } else {
      if (!name || !age || !sensitivity) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Name, age, and sensitivity are required to finish creating your account.' });
      }
      if (!Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 119) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Enter a valid age.' });
      }
      if (!Number.isInteger(Number(sensitivity)) || Number(sensitivity) < 1 || Number(sensitivity) > 5) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Sensitivity must be between 1 and 5.' });
      }
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Enter a valid name (1–255 characters).' });
      }

      const signupPlatformHeader = String(req.get('X-SoundScout-Platform') || '').toLowerCase();
      const signupPlatform = ['web', 'android'].includes(signupPlatformHeader) ? signupPlatformHeader : 'unknown';
      const announcementOptIn = req.body.announcementOptIn === true;
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      const created = await client.query(
        `INSERT INTO users (email, name, age, sensitivity, signup_platform, announcement_opt_in, announcement_unsubscribe_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name, age, sensitivity, signup_platform, announcement_opt_in, is_suspended`,
        [email, name.trim(), Number(age), Number(sensitivity), signupPlatform, announcementOptIn, unsubscribeToken]
      );
      user = created.rows[0];
    }

    await client.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otpRow.id]);
    await client.query('COMMIT');
    inTransaction = false;

    if (user.is_suspended === true) {
      return res.status(403).json({ error: 'This account has been suspended. Contact SoundScout support if you believe this is a mistake.' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const isAdmin = Boolean(adminEmail && user.email.trim().toLowerCase() === adminEmail);
    const token = jwt.sign(
      { sub: user.id, email: user.email, admin: isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { ...user, admin: isAdmin } });
  } catch (err) {
    if (inTransaction && client) await client.query('ROLLBACK').catch(() => {});
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Could not verify code. Try again.' });
  } finally {
    client?.release();
  }
});



/*
 * Google OAuth (authorization-code flow).
 * The client secret stays on the backend. A short-lived one-time code is
 * handed back to the web/native client; Google tokens never enter app storage.
 */
const googleStates = new Map();
const googleExchangeCodes = new Map();
let googleJwks = null;
let googleJwksExpiresAt = 0;

function configuredGoogleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

function webLoginUrl() {
  const base = String(process.env.PUBLIC_WEB_URL || process.env.PUBLIC_APP_URL || 'https://jellyfin-server.tail0a3780.ts.net').replace(/\/$/, '');
  return base + '/index.html';
}

router.get('/google/start', (req, res) => {
  const clientId = configuredGoogleClientId();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) {
    return res.status(503).send('Google sign-in is not configured yet.');
  }

  const platform = req.query.platform === 'android' ? 'android' : 'web';
  const state = crypto.randomBytes(32).toString('hex');
  const redirectBack = platform === 'android'
    ? String(process.env.MOBILE_AUTH_REDIRECT_URI || 'mobile://auth')
    : webLoginUrl();

  googleStates.set(state, { platform, redirectBack, partnerInvite: String(req.query.partnerInvite || '').slice(0, 256), expiresAt: Date.now() + 10 * 60 * 1000 });
  for (const [key, value] of googleStates) if (value.expiresAt < Date.now()) googleStates.delete(key);
  for (const [key, value] of googleExchangeCodes) if (value.expiresAt < Date.now()) googleExchangeCodes.delete(key);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

async function verifyGoogleIdToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Google identity token.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported Google identity token.');

  if (!googleJwks || Date.now() >= googleJwksExpiresAt) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('Could not retrieve Google signing keys.');
    googleJwks = await response.json();
    const cacheControl = response.headers.get('cache-control') || '';
    const maxAge = Number((cacheControl.match(/max-age=(\d+)/i) || [])[1] || 300);
    googleJwksExpiresAt = Date.now() + Math.min(maxAge, 3600) * 1000;
  }

  const jwk = (googleJwks.keys || []).find(key => key.kid === header.kid && key.alg === 'RS256');
  if (!jwk) {
    googleJwksExpiresAt = 0;
    throw new Error('Google signing key was not found.');
  }
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!validSignature) throw new Error('Google identity token signature is invalid.');

  const now = Math.floor(Date.now() / 1000);
  const audience = claims.aud;
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('Invalid Google token issuer.');
  if (audience !== configuredGoogleClientId() && !(Array.isArray(audience) && audience.includes(configuredGoogleClientId()))) throw new Error('Google token audience does not match.');
  if (!claims.sub || !claims.email || claims.email_verified !== true || !claims.exp || claims.exp <= now) throw new Error('Google account email is not verified or the token has expired.');
  return {
    email: String(claims.email).trim().toLowerCase(),
    name: String(claims.name || claims.given_name || '').trim().slice(0, 255)
  };
}

router.get('/google/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const pending = googleStates.get(state);
  googleStates.delete(state);
  if (!pending || pending.expiresAt < Date.now()) return res.status(400).send('Google sign-in session expired. Please try again.');
  if (req.query.error) return res.redirect(pending.redirectBack);

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code || ''),
        client_id: configuredGoogleClientId(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: String(process.env.GOOGLE_REDIRECT_URI || ''),
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error('Google could not complete sign-in.');
    const identity = await verifyGoogleIdToken(tokenData.id_token);
    const oneTimeCode = crypto.randomBytes(32).toString('hex');
    googleExchangeCodes.set(oneTimeCode, { identity, expiresAt: Date.now() + 5 * 60 * 1000 });
    const callbackUrl = new URL(pending.redirectBack);
    callbackUrl.searchParams.set('googleCode', oneTimeCode);
    if (pending.platform === 'web' && /^[a-f0-9]{32,128}$/i.test(pending.partnerInvite)) callbackUrl.searchParams.set('partnerInvite', pending.partnerInvite);
    return res.redirect(callbackUrl.toString());
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.status(401).send('Google sign-in could not be completed. Please return to SoundScout and try again.');
  }
});

router.post('/google/exchange', async (req, res) => {
  const code = String(req.body.code || '');
  const pending = googleExchangeCodes.get(code);
  if (!pending || pending.expiresAt < Date.now()) {
    googleExchangeCodes.delete(code);
    return res.status(401).json({ error: 'Google sign-in session expired. Please try again.' });
  }

  const { email, name: googleName } = pending.identity;
  try {
    let result = await pool.query(
      'SELECT id, email, name, age, sensitivity, is_suspended FROM users WHERE LOWER(email) = $1',
      [email]
    );
    let user = result.rows[0];

    if (!user) {
      const name = String(req.body.name || googleName || '').trim();
      const age = Number(req.body.age);
      const sensitivity = Number(req.body.sensitivity);
      if (!name || !Number.isInteger(age) || age < 1 || age > 119 || !Number.isInteger(sensitivity) || sensitivity < 1 || sensitivity > 5) {
        return res.json({ needsProfile: true, email, name: googleName });
      }

      const signupPlatformHeader = String(req.get('X-SoundScout-Platform') || '').toLowerCase();
      const signupPlatform = ['web', 'android'].includes(signupPlatformHeader) ? signupPlatformHeader : 'unknown';
      const announcementOptIn = req.body.announcementOptIn === true;
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      result = await pool.query(
        `INSERT INTO users (email, name, age, sensitivity, signup_platform, announcement_opt_in, announcement_unsubscribe_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, name, age, sensitivity, signup_platform, announcement_opt_in, is_suspended`,
        [email, name, age, sensitivity, signupPlatform, announcementOptIn, unsubscribeToken]
      );
      user = result.rows[0];
      if (!user) {
        const existing = await pool.query(
          'SELECT id, email, name, age, sensitivity, is_suspended FROM users WHERE LOWER(email) = $1',
          [email]
        );
        user = existing.rows[0];
      }
    }

    if (!user) return res.status(500).json({ error: 'Could not create your SoundScout account.' });
    if (user.is_suspended === true) return res.status(403).json({ error: 'This account has been suspended. Contact SoundScout support if you believe this is a mistake.' });

    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const isAdmin = Boolean(adminEmail && user.email.trim().toLowerCase() === adminEmail);
    const token = jwt.sign({ sub: user.id, email: user.email, admin: isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    googleExchangeCodes.delete(code);
    return res.json({ token, user: { ...user, admin: isAdmin } });
  } catch (err) {
    console.error('Google account exchange error:', err);
    return res.status(500).json({ error: 'Could not finish Google sign-in. Please try again.' });
  }
});

router.get('/unsubscribe/:token', (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).send('Invalid unsubscribe link.');
  res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · SoundScout</title><body style="font:16px Arial,sans-serif;max-width:520px;margin:12vh auto;padding:24px;color:#202b29"><h1>Unsubscribe from SoundScout updates?</h1><p>Confirm below to stop receiving optional product announcements.</p><form method="post"><button style="padding:12px 18px;border:0;border-radius:8px;background:#1e3937;color:white;font-size:15px">Confirm unsubscribe</button></form></body></html>`);
});

router.post('/unsubscribe/:token', async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).send('Invalid unsubscribe link.');
  try {
    const result = await pool.query(
      'UPDATE users SET announcement_opt_in = FALSE, announcement_unsubscribed_at = NOW() WHERE announcement_unsubscribe_token = $1 RETURNING id',
      [token]
    );
    if (!result.rowCount) return res.status(200).send('This unsubscribe link is invalid or has already been used.');
    res.status(200).send('You have been unsubscribed from SoundScout product announcements.');
  } catch (err) {
    console.error('Announcement unsubscribe error:', err);
    res.status(500).send('Could not process your request. Please try again later.');
  }
});


module.exports = router;