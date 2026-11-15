const express = require('express');
const publicRouter = express.Router();
const adminRouter = express.Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/adminAuth');

function writeAudit(db, req, action, id, metadata) {
  return db.query(
    'INSERT INTO admin_audit_logs (admin_id, admin_email, action, entity_type, entity_id, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [req.userId || null, req.userEmail || 'unknown', action, 'release_note', id == null ? null : String(id), null, JSON.stringify(metadata || {})]
  );
}
function validate(body) {
  const entry = {
    version: typeof body.version === 'string' ? body.version.trim() : '',
    title: typeof body.title === 'string' ? body.title.trim() : '',
    summary: typeof body.summary === 'string' ? body.summary.trim() : '',
    changes: Array.isArray(body.changes) ? body.changes.map(value => String(value).trim()).filter(Boolean) : [],
    status: body.status === 'published' ? 'published' : 'draft'
  };
  if (!entry.version || entry.version.length > 40) return { error: 'Version is required (max 40 characters).' };
  if (!entry.title || entry.title.length > 120) return { error: 'Title is required (max 120 characters).' };
  if (!entry.summary) return { error: 'Summary is required.' };
  if (!entry.changes.length || entry.changes.length > 30) return { error: 'Add 1–30 change items.' };
  return entry;
}

publicRouter.get('/', async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number.parseInt(req.query.limit, 10) || 6));
  try {
    const result = await pool.query(
      "SELECT id,version,title,summary,changes,published_at FROM release_notes WHERE status='published' AND published_at IS NOT NULL ORDER BY published_at DESC,id DESC LIMIT $1",
      [limit]
    );
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ items: result.rows });
  } catch (err) {
    console.error('Public release notes error:', err);
    res.status(500).json({ error: 'Could not load release notes.' });
  }
});

adminRouter.use(requireAuth, requireAdmin);
adminRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id,version,title,summary,changes,status,created_at,updated_at,published_at FROM release_notes ORDER BY COALESCE(published_at,updated_at,created_at) DESC,id DESC');
    res.json({ items: result.rows });
  } catch (err) { console.error('Admin release notes fetch error:', err); res.status(500).json({ error: 'Could not load release notes.' }); }
});
adminRouter.post('/', async (req, res) => {
  const entry = validate(req.body || {});
  if (entry.error) return res.status(400).json({ error: entry.error });
  try {
    const result = await pool.query(
      "INSERT INTO release_notes(version,title,summary,changes,status,created_by,published_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,CASE WHEN $5::varchar='published' THEN NOW() ELSE NULL END) RETURNING *",
      [entry.version,entry.title,entry.summary,JSON.stringify(entry.changes),entry.status,req.userId]
    );
    await writeAudit(pool,req,entry.status === 'published' ? 'release_note_published' : 'release_note_created',result.rows[0].id,{version:entry.version,title:entry.title});
    res.status(201).json({ item:result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error:'That version already exists.' });
    console.error('Release note create error:',err); res.status(500).json({ error:'Could not create release note.' });
  }
});
adminRouter.patch('/:id', async (req,res) => {
  const id = Number.parseInt(req.params.id,10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error:'Invalid release note ID.' });
  try {
    const current = await pool.query('SELECT * FROM release_notes WHERE id=$1',[id]);
    if (!current.rowCount) return res.status(404).json({ error:'Release note not found.' });
    const entry = validate(Object.assign({},current.rows[0],req.body || {}));
    if (entry.error) return res.status(400).json({ error:entry.error });
    const result = await pool.query(
      "UPDATE release_notes SET version=$2,title=$3,summary=$4,changes=$5::jsonb,status=$6,updated_at=NOW(),published_at=CASE WHEN $6::varchar='published' THEN COALESCE(published_at,NOW()) ELSE NULL END WHERE id=$1 RETURNING *",
      [id,entry.version,entry.title,entry.summary,JSON.stringify(entry.changes),entry.status]
    );
    await writeAudit(pool,req,entry.status === 'published' ? 'release_note_updated' : 'release_note_unpublished',id,{version:entry.version,title:entry.title,status:entry.status});
    res.json({ item:result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error:'That version already exists.' });
    console.error('Release note update error:',err); res.status(500).json({ error:'Could not update release note.' });
  }
});
adminRouter.delete('/:id', async (req,res) => {
  const id = Number.parseInt(req.params.id,10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error:'Invalid release note ID.' });
  try {
    const result = await pool.query('DELETE FROM release_notes WHERE id=$1 RETURNING id,version,title',[id]);
    if (!result.rowCount) return res.status(404).json({ error:'Release note not found.' });
    await writeAudit(pool,req,'release_note_deleted',id,result.rows[0]);
    res.json({ message:'Release note deleted.' });
  } catch (err) { console.error(err); res.status(500).json({ error:'Could not delete release note.' }); }
});
module.exports = { publicRouter, adminRouter };
