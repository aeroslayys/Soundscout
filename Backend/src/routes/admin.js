const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/adminAuth');

const PAGE_SIZE_MAX = 100;
const ALLOWED_FLAG_STATUSES = new Set(['reviewed', 'dismissed', 'action_taken']);

function pageParams(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function writeAudit(db, req, action, entityType, entityId, reason, metadata) {
  return db.query(
    'INSERT INTO admin_audit_logs (admin_id, admin_email, action, entity_type, entity_id, reason, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
    [req.userId || null, req.userEmail || 'unknown', action, entityType, entityId == null ? null : String(entityId), reason || null, JSON.stringify(metadata || {})]
  );
}

// Authenticated users can flag venues or ratings. Admin-only routes are protected below.
router.post('/flags', requireAuth, async (req, res) => {
  const targetType = String(req.body.targetType || '').trim();
  const targetId = String(req.body.targetId || '').trim();
  const reason = String(req.body.reason || '').trim();
  const details = typeof req.body.details === 'string' ? req.body.details.trim().slice(0, 2000) : null;

  if (!['rating', 'venue'].includes(targetType) || !validId(targetId)) {
    return res.status(400).json({ error: 'A valid target type and target ID are required.' });
  }
  if (reason.length < 3 || reason.length > 80) {
    return res.status(400).json({ error: 'Choose a reason between 3 and 80 characters.' });
  }

  try {
    const targetQuery = targetType === 'venue'
      ? await pool.query('SELECT id FROM venues WHERE id::text = $1 AND deleted_at IS NULL', [targetId])
      : await pool.query('SELECT id FROM ratings WHERE id::text = $1 AND deleted_at IS NULL', [targetId]);
    if (!targetQuery.rowCount) return res.status(404).json({ error: 'The item could not be found.' });

    const inserted = await pool.query(
      'INSERT INTO moderation_flags (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at',
      [req.userId, targetType, targetId, reason, details]
    );
    return res.status(201).json({ flag: inserted.rows[0] });
  } catch (err) {
    console.error('Flag submission error:', err);
    return res.status(500).json({ error: 'Could not submit this report.' });
  }
});

router.use(requireAuth, requireAdmin);

// Dashboard metrics
router.get('/dashboard', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT (SELECT COUNT(*) FROM venues WHERE deleted_at IS NULL) AS venues, (SELECT COUNT(*) FROM venues WHERE deleted_at IS NULL AND approval_status = 'pending') AS pending_venues, (SELECT COUNT(*) FROM ratings WHERE deleted_at IS NULL) AS active_ratings, (SELECT COUNT(*) FROM ratings WHERE deleted_at IS NOT NULL) AS deleted_ratings, (SELECT COUNT(*) FROM moderation_flags WHERE status = 'pending') AS pending_flags, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE is_suspended = TRUE) AS suspended_users"
    );
    const recent = await pool.query(
      'SELECT id, admin_email, action, entity_type, entity_id, reason, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 8'
    );
    res.json({ metrics: result.rows[0], recentActivity: recent.rows });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

// Venues: search, filters, pagination
router.get('/venues', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const search = String(req.query.search || '').trim().slice(0, 160);
  const status = String(req.query.status || 'active');
  const params = [];
  const where = [];
  if (status === 'deleted') where.push('v.deleted_at IS NOT NULL');
  else {
    where.push('v.deleted_at IS NULL');
    if (['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      where.push('v.approval_status = $' + params.length);
    }
  }
  if (search) {
    params.push('%' + search + '%');
    where.push('(v.name ILIKE $' + params.length + ' OR v.category ILIKE $' + params.length + ' OR v.id::text ILIKE $' + params.length + ')');
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM venues v ' + whereSql, params);
    const rowsParams = params.concat([limit, offset]);
    const rows = await pool.query(
      'SELECT v.id, v.name, v.category, ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lng, v.access, v.toilet, v.created_at, v.approval_status AS status, v.deleted_at, COUNT(r.id) FILTER (WHERE r.deleted_at IS NULL) AS "ratingCount", AVG(r.score) FILTER (WHERE r.deleted_at IS NULL) AS "averageScore" FROM venues v LEFT JOIN ratings r ON r.venue_id = v.id ' + whereSql + ' GROUP BY v.id, v.name, v.category, v.location, v.access, v.toilet, v.created_at, v.approval_status, v.deleted_at ORDER BY v.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
      rowsParams
    );
    res.json({ items: rows.rows, page, limit, total: count.rows[0].total });
  } catch (err) {
    console.error('Admin venue fetch error:', err);
    res.status(500).json({ error: 'Failed to load venues.' });
  }
});

// Venue duplicate candidates: same normalized name or within 150m.
router.get('/venues/duplicates', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT a.id AS \"venueId\", a.name AS \"venueName\", b.id AS \"duplicateId\", b.name AS \"duplicateName\", ROUND(ST_Distance(a.location, b.location)::numeric) AS \"distanceMeters\" FROM venues a JOIN venues b ON a.id::text < b.id::text AND (LOWER(REGEXP_REPLACE(TRIM(a.name), '\\s+', ' ', 'g')) = LOWER(REGEXP_REPLACE(TRIM(b.name), '\\s+', ' ', 'g')) OR ST_DWithin(a.location, b.location, 150)) WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY \"distanceMeters\" ASC NULLS LAST LIMIT 200"
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error('Venue duplicate scan error:', err);
    res.status(500).json({ error: 'Could not scan for duplicate venues.' });
  }
});

// Edit a venue and/or update its approval status.
router.patch('/venues/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const category = typeof body.category === 'string' ? body.category.trim() : null;
  const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== '';
  const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== '';
  const lat = hasLat ? Number(body.lat) : null;
  const lng = hasLng ? Number(body.lng) : null;
  const access = typeof body.access === 'boolean' ? body.access : null;
  const toilet = typeof body.toilet === 'boolean' ? body.toilet : null;
  const status = body.status === undefined ? null : String(body.status);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  if (!validId(id)) return res.status(400).json({ error: 'Invalid venue ID.' });
  if (name !== null && (!name || name.length > 255)) return res.status(400).json({ error: 'Venue name must be between 1 and 255 characters.' });
  if (category !== null && (!category || category.length > 100)) return res.status(400).json({ error: 'Category must be between 1 and 100 characters.' });
  if (hasLat !== hasLng) return res.status(400).json({ error: 'Latitude and longitude must be supplied together.' });
  if (hasLat && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)) return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
  if (status !== null && !['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid approval status.' });
  if (status === 'rejected' && reason.length < 3) return res.status(400).json({ error: 'Provide a reason when rejecting a venue.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      'UPDATE venues SET name = COALESCE($2, name), category = COALESCE($3, category), location = CASE WHEN $4::double precision IS NULL THEN location ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography END, access = COALESCE($6, access), toilet = COALESCE($7, toilet), approval_status = COALESCE($8, approval_status), approved_by = CASE WHEN $8 = \'approved\' THEN $9 ELSE approved_by END, approved_at = CASE WHEN $8 = \'approved\' THEN NOW() WHEN $8 = \'pending\' THEN NULL ELSE approved_at END, rejected_at = CASE WHEN $8 = \'rejected\' THEN NOW() WHEN $8 = \'pending\' OR $8 = \'approved\' THEN NULL ELSE rejected_at END WHERE id::text = $1 AND deleted_at IS NULL RETURNING id, name, category, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, access, toilet, approval_status AS status',
      [id, name, category, lat, lng, access, toilet, status, req.userId]
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venue not found.' });
    }
    const action = status ? 'venue_' + status : 'venue_updated';
    await writeAudit(client, req, action, 'venue', id, reason || null, { fields: Object.keys(body).filter(k => k !== 'reason') });
    await client.query('COMMIT');
    res.json({ venue: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin venue update error:', err);
    res.status(500).json({ error: 'Failed to update venue.' });
  } finally {
    client.release();
  }
});

// Soft-delete a venue, preserving its related ratings and moderation history.
router.delete('/venues/:id', async (req, res) => {
  const id = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!validId(id)) return res.status(400).json({ error: 'Invalid venue ID.' });
  if (reason.length < 3) return res.status(400).json({ error: 'Provide a reason for deleting the venue.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE venues SET deleted_at = NOW(), deleted_by = $2, deletion_reason = $3 WHERE id::text = $1 AND deleted_at IS NULL RETURNING id, name',
      [id, req.userId, reason]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venue not found.' });
    }
    await writeAudit(client, req, 'venue_deleted', 'venue', id, reason, { name: result.rows[0].name });
    await client.query('COMMIT');
    res.json({ message: 'Venue moved to deleted items.', venue: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin venue deletion error:', err);
    res.status(500).json({ error: 'Failed to delete venue.' });
  } finally {
    client.release();
  }
});

// Restore a soft-deleted venue.
router.post('/venues/:id/restore', async (req, res) => {
  const id = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : 'Restored by administrator';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE venues SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL WHERE id::text = $1 AND deleted_at IS NOT NULL RETURNING id, name',
      [id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deleted venue not found.' });
    }
    await writeAudit(client, req, 'venue_restored', 'venue', id, reason, { name: result.rows[0].name });
    await client.query('COMMIT');
    res.json({ venue: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Venue restore error:', err);
    res.status(500).json({ error: 'Could not restore venue.' });
  } finally {
    client.release();
  }
});

// Ratings are the existing SoundScout review records (the current schema has no text-comment column).
router.get('/reviews', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const search = String(req.query.search || '').trim().slice(0, 160);
  const status = String(req.query.status || 'active');
  const params = [];
  const where = [];
  if (status === 'deleted') where.push('r.deleted_at IS NOT NULL');
  else {
    where.push('r.deleted_at IS NULL');
  }
  if (search) {
    params.push('%' + search + '%');
    where.push('(v.name ILIKE $' + params.length + ' OR u.name ILIKE $' + params.length + ' OR u.email ILIKE $' + params.length + ' OR r.id::text ILIKE $' + params.length + ')');
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM ratings r LEFT JOIN venues v ON v.id = r.venue_id LEFT JOIN users u ON u.id = r.user_id ' + whereSql, params);
    const rows = await pool.query(
      'SELECT r.id, r.score, r.time_of_day, r.measured_db, r.had_audio_clip, r.submitted_at, r.deleted_at, r.deletion_reason, v.id AS "venueId", v.name AS "venueName", u.id AS "userId", u.name AS "userName", u.email AS "userEmail" FROM ratings r LEFT JOIN venues v ON v.id = r.venue_id LEFT JOIN users u ON u.id = r.user_id ' + whereSql + ' ORDER BY r.submitted_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
      params.concat([limit, offset])
    );
    res.json({ items: rows.rows, page, limit, total: count.rows[0].total });
  } catch (err) {
    console.error('Admin review fetch error:', err);
    res.status(500).json({ error: 'Failed to load ratings.' });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  const id = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!validId(id)) return res.status(400).json({ error: 'Invalid rating ID.' });
  if (reason.length < 3) return res.status(400).json({ error: 'Provide a moderation reason.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE ratings SET deleted_at = NOW(), deleted_by = $2, deletion_reason = $3 WHERE id::text = $1 AND deleted_at IS NULL RETURNING id, venue_id',
      [id, req.userId, reason]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active rating not found.' });
    }
    await writeAudit(client, req, 'review_deleted', 'rating', id, reason, { venueId: result.rows[0].venue_id });
    await client.query('COMMIT');
    res.json({ message: 'Rating removed from public results.', id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rating moderation error:', err);
    res.status(500).json({ error: 'Failed to remove rating.' });
  } finally {
    client.release();
  }
});

router.post('/reviews/:id/restore', async (req, res) => {
  const id = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : 'Restored by administrator';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE ratings SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL WHERE id::text = $1 AND deleted_at IS NOT NULL RETURNING id, venue_id',
      [id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deleted rating not found.' });
    }
    await writeAudit(client, req, 'review_restored', 'rating', id, reason, { venueId: result.rows[0].venue_id });
    await client.query('COMMIT');
    res.json({ message: 'Rating restored.', id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rating restore error:', err);
    res.status(500).json({ error: 'Could not restore rating.' });
  } finally {
    client.release();
  }
});

// Moderation queue
router.get('/flags', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const status = String(req.query.status || 'pending');
  const params = [];
  const where = [];
  if (['pending', 'reviewed', 'dismissed', 'action_taken'].includes(status)) {
    params.push(status);
    where.push('f.status = $' + params.length);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM moderation_flags f ' + whereSql, params);
    const rows = await pool.query(
      'SELECT f.id, f.target_type AS "targetType", f.target_id AS "targetId", f.reason, f.details, f.status, f.created_at, f.reviewed_at, f.resolution_notes AS "resolutionNotes", reporter.name AS "reporterName", reporter.email AS "reporterEmail", v.name AS "venueName", r.score AS "ratingScore" FROM moderation_flags f LEFT JOIN users reporter ON reporter.id = f.reporter_id LEFT JOIN venues v ON f.target_type = \'venue\' AND v.id::text = f.target_id LEFT JOIN ratings r ON f.target_type = \'rating\' AND r.id::text = f.target_id ' + whereSql + ' ORDER BY f.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
      params.concat([limit, offset])
    );
    res.json({ items: rows.rows, page, limit, total: count.rows[0].total });
  } catch (err) {
    console.error('Moderation queue error:', err);
    res.status(500).json({ error: 'Failed to load moderation queue.' });
  }
});

router.patch('/flags/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = String(req.body?.status || '');
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid flag ID.' });
  if (!ALLOWED_FLAG_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid moderation status.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE moderation_flags SET status = $2, reviewed_by = $3, reviewed_at = NOW(), resolution_notes = $4 WHERE id = $1 RETURNING id, target_type, target_id',
      [id, status, req.userId, notes || null]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Flag not found.' });
    }
    const flag = result.rows[0];
    await writeAudit(client, req, 'flag_' + status, 'moderation_flag', id, notes || null, { targetType: flag.target_type, targetId: flag.target_id });
    await client.query('COMMIT');
    res.json({ message: 'Moderation item updated.', id, status });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Moderation update error:', err);
    res.status(500).json({ error: 'Could not update moderation item.' });
  } finally {
    client.release();
  }
});

// User directory and suspension controls
router.get('/users', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const search = String(req.query.search || '').trim().slice(0, 160);
  const params = [];
  let whereSql = '';
  if (search) {
    params.push('%' + search + '%');
    whereSql = 'WHERE (name ILIKE $1 OR email ILIKE $1 OR id::text ILIKE $1)';
  }
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM users ' + whereSql, params);
    const rows = await pool.query(
      'SELECT id, name, email, age, sensitivity, created_at, is_suspended AS suspended, suspended_at, suspension_reason FROM users ' + whereSql + ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
      params.concat([limit, offset])
    );
    res.json({ items: rows.rows, page, limit, total: count.rows[0].total });
  } catch (err) {
    console.error('Admin user fetch error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.patch('/users/:id/suspension', async (req, res) => {
  const id = req.params.id;
  const suspended = req.body?.suspended === true;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!validId(id)) return res.status(400).json({ error: 'Invalid user ID.' });
  if (String(req.userId) === id) return res.status(400).json({ error: 'You cannot suspend your own account.' });
  if (suspended && reason.length < 3) return res.status(400).json({ error: 'Provide a reason for suspending this account.' });
  const protectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE users SET is_suspended = $2, suspended_at = CASE WHEN $2 THEN NOW() ELSE NULL END, suspension_reason = CASE WHEN $2 THEN $3 ELSE NULL END WHERE id::text = $1 AND LOWER(email) <> $4 RETURNING id, email, name, is_suspended AS suspended',
      [id, suspended, reason || null, protectedEmail]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found or protected administrator account.' });
    }
    await writeAudit(client, req, suspended ? 'user_suspended' : 'user_unsuspended', 'user', id, reason || null, { email: result.rows[0].email });
    await client.query('COMMIT');
    res.json({ user: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('User restriction error:', err);
    res.status(500).json({ error: 'Failed to update account restriction.' });
  } finally {
    client.release();
  }
});

// Searchable audit history
router.get('/audit', async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const search = String(req.query.search || '').trim().slice(0, 160);
  const params = [];
  let whereSql = '';
  if (search) {
    params.push('%' + search + '%');
    whereSql = 'WHERE (admin_email ILIKE $1 OR action ILIKE $1 OR entity_type ILIKE $1 OR COALESCE(entity_id, \'\') ILIKE $1 OR COALESCE(reason, \'\') ILIKE $1)';
  }
  try {
    const count = await pool.query('SELECT COUNT(*)::int AS total FROM admin_audit_logs ' + whereSql, params);
    const rows = await pool.query(
      'SELECT id, admin_email, action, entity_type, entity_id, reason, metadata, created_at FROM admin_audit_logs ' + whereSql + ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
      params.concat([limit, offset])
    );
    res.json({ items: rows.rows, page, limit, total: count.rows[0].total });
  } catch (err) {
    console.error('Admin audit log error:', err);
    res.status(500).json({ error: 'Failed to load audit log.' });
  }
});

module.exports = router;
