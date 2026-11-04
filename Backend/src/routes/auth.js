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
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/request-otp
// body: { email }
// Sends a fresh OTP by email. Tells the frontend whether this email is new
// (so it knows to show the name/age/sensitivity fields) or returning.
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const cooldownKey = email.toLowerCase();
  const lastSent = lastSentAt.get(cooldownKey);
  if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_SECONDS * 1000) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSeconds}s before requesting another code.` });
  }

  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const isNewUser = existingUser.rowCount === 0;
    const purpose = isNewUser ? 'signup' : 'login';

    const code = generateOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [email, codeHash, purpose, expiresAt]
    );

    await sendOtpEmail(email, code, { isNewUser });
    lastSentAt.set(cooldownKey, Date.now());

    return res.json({ isNewUser, expiresInMinutes: OTP_EXPIRY_MINUTES });
  } catch (err) {
    console.error('request-otp error:', err);
    return res.status(500).json({ error: 'Could not send verification code. Try again shortly.' });
  }
});

// POST /api/auth/verify-otp
// body for returning users: { email, code }
// body for new users:       { email, code, name, age, sensitivity }
router.post('/verify-otp', async (req, res) => {
  const { email, code, name, age, sensitivity } = req.body;

  if (!isValidEmail(email) || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  try {
    const otpResult = await pool.query(
      `SELECT id, code_hash, purpose FROM otp_codes
       WHERE email = $1 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (otpResult.rowCount === 0) {
      return res.status(401).json({ error: 'Code expired or not found. Request a new one.' });
    }

    const otpRow = otpResult.rows[0];
    const isMatch = await bcrypt.compare(code, otpRow.code_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect code.' });
    }

    await pool.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otpRow.id]);

    let user;
    const existing = await pool.query('SELECT id, email, name, age, sensitivity, is_suspended FROM users WHERE email = $1', [email]);

    if (existing.rowCount > 0) {
      user = existing.rows[0];
    } else {
      // New user — signup fields are required at this step
      if (!name || !age || !sensitivity) {
        return res.status(400).json({ error: 'Name, age, and sensitivity are required to finish creating your account.' });
      }
      if (age < 1 || age > 119) {
        return res.status(400).json({ error: 'Enter a valid age.' });
      }
      if (sensitivity < 1 || sensitivity > 5) {
        return res.status(400).json({ error: 'Sensitivity must be between 1 and 5.' });
      }

      const signupPlatformHeader = String(req.get('X-SoundScout-Platform') || '').toLowerCase();
      const signupPlatform = ['web', 'android'].includes(signupPlatformHeader) ? signupPlatformHeader : 'unknown';
      const announcementOptIn = req.body.announcementOptIn === true;
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      const created = await pool.query(
        `INSERT INTO users (email, name, age, sensitivity, signup_platform, announcement_opt_in, announcement_unsubscribe_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name, age, sensitivity, signup_platform, announcement_opt_in`,
        [email, name, age, sensitivity, signupPlatform, announcementOptIn, unsubscribeToken]
      );
      user = created.rows[0];
    }

    if (user.is_suspended === true) {
      return res.status(403).json({ error: 'This account has been suspended. Contact SoundScout support if you believe this is a mistake.' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const isAdmin =
  adminEmail &&
  user.email.trim().toLowerCase() === adminEmail;

const token = jwt.sign(
  {
    sub: user.id,
    email: user.email,
    admin: isAdmin
  },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
    return res.json({
  token,
  user: {
    ...user,
    admin: isAdmin
  }
});
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Could not verify code. Try again.' });
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