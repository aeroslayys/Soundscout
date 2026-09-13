const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();


// ==========================================
// Authentication middleware
// ==========================================

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    req.isAdmin = decoded.admin === true;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
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

          COUNT(r.id) AS "ratingCount",

          AVG(r.score) AS "averageScore"

        FROM venues v

        LEFT JOIN ratings r
          ON r.venue_id = v.id

        WHERE v.created_by = $1

        GROUP BY
          v.id,
          v.name,
          v.category,
          v.location,
          v.access,
          v.toilet,
          v.created_at

        ORDER BY
          v.created_at DESC;
        `,
        [req.userId]
      );
327319
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