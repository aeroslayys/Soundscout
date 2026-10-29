const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();


// ==========================================
// Authentication middleware
// ==========================================

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  if (!decoded.sub) return res.status(401).json({ error: 'Invalid token.' });

  try {
    const account = await pool.query('SELECT id, email, is_suspended FROM users WHERE id = $1', [decoded.sub]);
    if (!account.rowCount) return res.status(401).json({ error: 'Account not found.' });
    if (account.rows[0].is_suspended === true) return res.status(403).json({ error: 'This account has been suspended.' });
    req.userId = account.rows[0].id;
    req.userEmail = account.rows[0].email;
    req.isAdmin = decoded.admin === true;
    next();
  } catch (err) {
    console.error('User route auth lookup error:', err);
    return res.status(500).json({ error: 'Could not verify account status.' });
  }
}


// ==========================================
// GET CURRENT USER'S RATINGS
//
// GET /api/users/me/ratings
// ==========================================

router.get(
  '/me/ratings',
  requireAuth,
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        SELECT
          r.id,
          r.score,
          r.time_of_day AS time,

          r.measured_db,

          EXTRACT(
            EPOCH FROM r.submitted_at
          ) * 1000 AS timestamp,

          v.id AS "venueId",
          v.name AS "venueName",
          v.category,

          v.access,
          v.toilet,

          v.created_by,

          CASE
            WHEN v.created_by = $1 THEN true
            ELSE false
          END AS "isVenueCreator"

        FROM ratings r

        JOIN venues v
          ON v.id = r.venue_id

        WHERE r.user_id = $1
          AND r.deleted_at IS NULL

        ORDER BY r.submitted_at DESC;
        `,
        [req.userId]
      );

      res.json(result.rows);

    } catch (error) {

      console.error(
        'Failed to load user ratings:',
        error
      );

      res.status(500).json({
        error: 'Could not load your ratings.'
      });

    }

  }
);
// ==========================================
// GET VENUES CREATED BY CURRENT USER
//
// GET /api/users/me/venues
// ==========================================

router.get(
  '/me/venues',
  requireAuth,
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        SELECT

          v.id,
          v.name,
          v.category,

          ST_Y(
            v.location::geometry
          ) AS lat,

          ST_X(
            v.location::geometry
          ) AS lng,

          v.access,
          v.toilet,

          v.created_at,

          v.approval_status AS status,

          COUNT(r.id) AS "ratingCount",

          AVG(r.score) AS "averageScore",

          AVG(r.measured_db)
            FILTER (
              WHERE r.measured_db IS NOT NULL
            ) AS "averageMeasuredDb"

        FROM venues v

        LEFT JOIN ratings r
          ON r.venue_id = v.id
          AND r.deleted_at IS NULL

        WHERE v.created_by = $1
          AND v.deleted_at IS NULL

        GROUP BY
          v.id,
          v.name,
          v.category,
          v.location,
          v.access,
          v.toilet,
          v.created_at,
          v.approval_status

        ORDER BY
          v.created_at DESC;
        `,
        [req.userId]
      );

      res.json(result.rows);

    } catch (error) {

      console.error(
        'Failed to load user venues:',
        error
      );

      res.status(500).json({
        error: 'Could not load your venues.'
      });

    }

  }
);

module.exports = router;