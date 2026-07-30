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
    const existing = await pool.query('SELECT id, email, name, age, sensitivity FROM users WHERE email = $1', [email]);

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

      const created = await pool.query(
        `INSERT INTO users (email, name, age, sensitivity)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, age, sensitivity`,
        [email, name, age, sensitivity]
      );
      user = created.rows[0];
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({ token, user });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Could not verify code. Try again.' });
  }
});

module.exports = router;