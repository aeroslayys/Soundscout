const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/adminAuth');

const router = express.Router();
const EVENT_TYPES = new Set(['live_music', 'dj_party', 'special_occasion', 'sports_screening', 'private_event', 'other']);
const CROWD_LEVELS = new Set(['low', 'moderate', 'high', 'very_high', 'unknown']);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function requireVenuePartner(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT vp.venue_id, v.name AS venue_name, v.time_zone
       FROM venue_partners vp
       JOIN venues v ON v.id = vp.venue_id
       WHERE vp.user_id = $1 AND vp.active = TRUE
         AND v.deleted_at IS NULL AND v.approval_status = 'approved'
       ORDER BY v.name`,
      [req.userId]
    );
    req.partnerVenues = result.rows;
    next();
  } catch (error) {
    console.error('Partner permission lookup error:', error);
    res.status(500).json({ error: 'Could not verify venue partner access.' });
  }
}

router.use(requireAuth);

// Accept an invitation only after OTP login has verified the same email address.
router.post('/invites/accept', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'Invalid invitation link.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invite = await client.query(
      `SELECT i.id, i.venue_id, i.email
       FROM venue_partner_invites i
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL
         AND i.revoked_at IS NULL AND i.expires_at > NOW()
       FOR UPDATE`,
      [hashToken(token)]
    );
    if (!invite.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This invitation is invalid, expired, or already used.' });
    }
    if (invite.rows[0].email !== String(req.userEmail || '').trim().toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sign in with the email address this invitation was sent to.' });
    }

    const row = invite.rows[0];
    await client.query(
      `INSERT INTO venue_partners (venue_id, user_id, invite_id, assigned_by)
       VALUES ($1, $2, $3, (SELECT invited_by FROM venue_partner_invites WHERE id = $3))
       ON CONFLICT (venue_id, user_id) DO UPDATE SET active = TRUE, invite_id = EXCLUDED.invite_id`,
      [row.venue_id, req.userId, row.id]
    );
    await client.query(
      'UPDATE venue_partner_invites SET accepted_at = NOW(), accepted_by = $2 WHERE id = $1',
      [row.id, req.userId]
    );
    await client.query('COMMIT');
    res.json({ message: 'Venue partner access activated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Partner invitation acceptance error:', error);
    res.status(500).json({ error: 'Could not accept this invitation.' });
  } finally {
    client.release();
  }
});

router.get('/venues', requireVenuePartner, (req, res) => {
  res.json({ venues: req.partnerVenues });
});

router.get('/venues/:venueId/events', requireVenuePartner, async (req, res) => {
  const allowed = req.partnerVenues.some((venue) => venue.venue_id === req.params.venueId);
  if (!allowed) return res.status(403).json({ error: 'You do not manage this venue.' });
  try {
    const result = await pool.query(
      `SELECT id, venue_id, title, event_type, description, starts_at, ends_at,
              expected_crowd, amplified_music, status, created_at, updated_at
       FROM venue_events WHERE venue_id = $1
       ORDER BY starts_at DESC LIMIT 100`,
      [req.params.venueId]
    );
    res.json({ events: result.rows });
  } catch (error) {
    console.error('Partner event list error:', error);
    res.status(500).json({ error: 'Could not load venue events.' });
  }
});

router.post('/venues/:venueId/events', requireVenuePartner, async (req, res) => {
  const venueId = req.params.venueId;
  if (!req.partnerVenues.some((venue) => venue.venue_id === venueId)) {
    return res.status(403).json({ error: 'You do not manage this venue.' });
  }
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const eventType = String(body.eventType || '');
  const startsAt = validDate(body.startsAt);
  const endsAt = validDate(body.endsAt);
  const crowd = String(body.expectedCrowd || 'unknown');
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null;
  if (!title || title.length > 160) return res.status(400).json({ error: 'Event title must be 1–160 characters.' });
  if (!EVENT_TYPES.has(eventType)) return res.status(400).json({ error: 'Choose a valid event type.' });
  if (!startsAt || !endsAt || endsAt <= startsAt) return res.status(400).json({ error: 'A valid start and end time are required.' });
  if (!CROWD_LEVELS.has(crowd)) return res.status(400).json({ error: 'Choose a valid expected crowd level.' });
  if (body.amplifiedMusic !== undefined && typeof body.amplifiedMusic !== 'boolean') {
    return res.status(400).json({ error: 'Amplified music must be true or false.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO venue_events
       (venue_id, created_by, updated_by, title, event_type, description, starts_at, ends_at, expected_crowd, amplified_music)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [venueId, req.userId, title, eventType, description, startsAt, endsAt, crowd, body.amplifiedMusic === true]
    );
    await client.query(
      "INSERT INTO venue_event_audit_logs (event_id, actor_id, action, changes) VALUES ($1, $2, 'created', $3::jsonb)",
      [inserted.rows[0].id, req.userId, JSON.stringify({ title, eventType, startsAt, endsAt, crowd, amplifiedMusic: body.amplifiedMusic === true })]
    );
    await client.query('COMMIT');
    res.status(201).json({ event: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Partner event create error:', error);
    res.status(500).json({ error: 'Could not create this event.' });
  } finally {
    client.release();
  }
});

router.patch('/events/:eventId', requireVenuePartner, async (req, res) => {
  const eventId = req.params.eventId;
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT e.* FROM venue_events e
       JOIN venue_partners vp ON vp.venue_id = e.venue_id
       WHERE e.id = $1 AND vp.user_id = $2 AND vp.active = TRUE
       FOR UPDATE OF e`,
      [eventId, req.userId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found for a venue you manage.' });
    }
    const old = existing.rows[0];
    const title = body.title === undefined ? old.title : String(body.title).trim();
    const eventType = body.eventType === undefined ? old.event_type : String(body.eventType);
    const description = body.description === undefined ? old.description : String(body.description).trim().slice(0, 2000);
    const startsAt = body.startsAt === undefined ? new Date(old.starts_at) : validDate(body.startsAt);
    const endsAt = body.endsAt === undefined ? new Date(old.ends_at) : validDate(body.endsAt);
    const crowd = body.expectedCrowd === undefined ? old.expected_crowd : String(body.expectedCrowd);
    const amplified = body.amplifiedMusic === undefined ? old.amplified_music : body.amplifiedMusic;
    const status = body.status === undefined ? old.status : String(body.status);
    if (!title || title.length > 160 || !EVENT_TYPES.has(eventType) || !startsAt || !endsAt || endsAt <= startsAt ||
        !CROWD_LEVELS.has(crowd) || typeof amplified !== 'boolean' || !['published', 'cancelled'].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The event details are invalid.' });
    }
    const updated = await client.query(
      `UPDATE venue_events SET title=$2, event_type=$3, description=$4, starts_at=$5,
       ends_at=$6, expected_crowd=$7, amplified_music=$8, status=$9, updated_by=$10, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [eventId, title, eventType, description, startsAt, endsAt, crowd, amplified, status, req.userId]
    );
    await client.query(
      'INSERT INTO venue_event_audit_logs (event_id, actor_id, action, changes) VALUES ($1, $2, $3, $4::jsonb)',
      [eventId, req.userId, status === 'cancelled' ? 'cancelled' : 'updated',
       JSON.stringify({ before: { title: old.title, eventType: old.event_type, startsAt: old.starts_at, endsAt: old.ends_at, status: old.status },
                        after: { title, eventType, startsAt, endsAt, status } })]
    );
    await client.query('COMMIT');
    res.json({ event: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Partner event update error:', error);
    res.status(500).json({ error: 'Could not update this event.' });
  } finally {
    client.release();
  }
});

module.exports = router;
