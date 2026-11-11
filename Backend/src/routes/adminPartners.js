const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/adminAuth');
const { sendVenuePartnerInvite } = require('../mailer');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function audit(db, req, action, entityId, metadata) {
  return db.query(
    `INSERT INTO admin_audit_logs (admin_id, admin_email, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'venue_partner', $4, $5::jsonb)`,
    [req.userId, req.userEmail, action, entityId, JSON.stringify(metadata || {})]
  );
}

router.get('/', async (req, res) => {
  try {
    const [partners, invites] = await Promise.all([
      pool.query(
        `SELECT vp.id, vp.user_id, vp.venue_id, vp.active, vp.created_at,
                u.name AS partner_name, u.email AS partner_email, v.name AS venue_name
         FROM venue_partners vp JOIN users u ON u.id = vp.user_id
         JOIN venues v ON v.id = vp.venue_id ORDER BY vp.created_at DESC LIMIT 200`
      ),
      pool.query(
        `SELECT i.id, i.email, i.venue_id, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
                v.name AS venue_name
         FROM venue_partner_invites i JOIN venues v ON v.id = i.venue_id
         ORDER BY i.created_at DESC LIMIT 200`
      )
    ]);
    res.json({ partners: partners.rows, invitations: invites.rows });
  } catch (error) {
    console.error('Admin partner list error:', error);
    res.status(500).json({ error: 'Could not load venue partners.' });
  }
});

router.post('/invites', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const venueId = String(req.body?.venueId || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'Enter a valid partner email address.' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(venueId)) return res.status(400).json({ error: 'Choose a valid venue.' });

  const venue = await pool.query(
    `SELECT id, name FROM venues WHERE id = $1 AND deleted_at IS NULL AND approval_status = 'approved'`,
    [venueId]
  );
  if (!venue.rowCount) return res.status(404).json({ error: 'Approved venue not found.' });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE venue_partner_invites SET revoked_at = NOW()
       WHERE email = $1 AND venue_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [email, venueId]
    );
    const inserted = await client.query(
      `INSERT INTO venue_partner_invites (venue_id, email, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [venueId, email, tokenHash, req.userId, expiresAt]
    );
    await audit(client, req, 'partner_invited', inserted.rows[0].id, { email, venueId, venueName: venue.rows[0].name });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin partner invitation create error:', error);
    return res.status(500).json({ error: 'Could not create invitation.' });
  } finally {
    client.release();
  }

  try {
    const baseUrl = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('PUBLIC_APP_URL is not configured');
    await sendVenuePartnerInvite(email, {
      venueName: venue.rows[0].name,
      inviteUrl: baseUrl + '/?partnerInvite=' + rawToken,
      expiresAt
    });
    res.status(201).json({ message: 'Invitation created and email sent.' });
  } catch (error) {
    console.error('Partner invitation email error:', error);
    res.status(201).json({ message: 'Invitation created, but email delivery failed. Revoke and resend after checking mail configuration.' });
  }
});

router.patch('/:partnerId', async (req, res) => {
  const active = req.body?.active;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'An active boolean is required.' });
  try {
    const result = await pool.query(
      'UPDATE venue_partners SET active = $2 WHERE id = $1 RETURNING id, active, venue_id, user_id',
      [req.params.partnerId, active]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Partner assignment not found.' });
    await audit(pool, req, active ? 'partner_activated' : 'partner_revoked', result.rows[0].id, result.rows[0]);
    res.json({ assignment: result.rows[0] });
  } catch (error) {
    console.error('Admin partner update error:', error);
    res.status(500).json({ error: 'Could not update partner access.' });
  }
});

router.post('/invites/:inviteId/revoke', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE venue_partner_invites SET revoked_at = NOW()
       WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id, email, venue_id`,
      [req.params.inviteId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Pending invitation not found.' });
    await audit(pool, req, 'partner_invite_revoked', result.rows[0].id, result.rows[0]);
    res.json({ invitation: result.rows[0] });
  } catch (error) {
    console.error('Admin invitation revoke error:', error);
    res.status(500).json({ error: 'Could not revoke invitation.' });
  }
});

module.exports = router;
