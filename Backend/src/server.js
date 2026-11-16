require('dotenv').config();
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32 || /change.?me|example|replace|secret|your/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 bytes.');
}

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const audioRoutes = require('./routes/audio');
const venueRoutes = require('./routes/venues');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const adminPartnerRoutes = require('./routes/adminPartners');
const partnerRoutes = require('./routes/partner');
const releaseNotesRoutes = require('./routes/releaseNotes');
const otpRateLimiter = require('./otpRateLimiter');

otpRateLimiter.startCleanup();

const app = express();
const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined
  ? 0
  : Number(process.env.TRUST_PROXY_HOPS);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 1) {
  throw new Error('TRUST_PROXY_HOPS must be 0 or 1 for the configured single-proxy deployment.');
}
app.set('trust proxy', trustProxyHops);


const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header (e.g. server-to-server or curl) are not browser CORS requests.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
}));

app.use(express.json());


// ROUTES

app.use('/api/auth', authRoutes);

app.use('/api/audio', audioRoutes);

app.use('/api/venues', venueRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/partners', adminPartnerRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/release-notes', releaseNotesRoutes.publicRouter);
app.use('/api/admin/release-notes', releaseNotesRoutes.adminRouter);

// HEALTH CHECK

app.get('/health', (req, res) => {

  res.json({
    ok: true
  });

});


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {

  console.log(
    `SoundScout backend running on port ${PORT}`
  );

});