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
    return res.status(401).json({
      error: 'Authentication required.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Your JWT may use either id or userId.
    // JWT generated in auth.js stores the user UUID in `sub`
    req.userId = decoded.sub;

    if (!req.userId) {
      return res.status(401).json({
        error: 'Invalid token.'
      });
    }

    next();

  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired token.'
    });
  }
}


// ==========================================
// GET ALL VENUES
// GET /api/venues
// ==========================================

router.get('/', async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        v.id,
        v.name,
        v.category,

        ST_Y(v.location::geometry) AS lat,
        ST_X(v.location::geometry) AS lng,

        v.access,
        v.toilet,

        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'score', r.score,
              'time', r.time_of_day,
              'measured_db', r.measured_db,
              'timestamp',
                EXTRACT(
                  EPOCH FROM r.submitted_at
                ) * 1000
            )
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) AS ratings

      FROM venues v

      LEFT JOIN ratings r
        ON r.venue_id = v.id

      GROUP BY
        v.id,
        v.name,
        v.category,
        v.location,
        v.access,
        v.toilet

      ORDER BY v.created_at DESC;
    `);

    res.json(result.rows);

  } catch (error) {

    console.error('Failed to load venues:', error);

    res.status(500).json({
      error: 'Could not load venues.'
    });

  }

});


// ==========================================
// SEARCH LOCATION
// GET /api/venues/search-location?q=Auroville
//
// Frontend calls our backend.
// Backend calls Nominatim.
// ==========================================

router.get('/search-location', async (req, res) => {

  const query = String(req.query.q || '').trim();

  if (query.length < 3) {
    return res.json([]);
  }

  try {

    const url =
      'https://nominatim.openstreetmap.org/search' +
      '?format=jsonv2' +
      '&limit=5' +
      '&q=' + encodeURIComponent(query);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SoundScout/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(
        'Nominatim returned HTTP ' + response.status
      );
    }

    const data = await response.json();

    const results = data.map(function(place) {
      return {
        display_name: place.display_name,
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon)
      };
    });

    res.json(results);

  } catch (error) {

    console.error('Location search failed:', error);

    res.status(500).json({
      error: 'Location search failed.'
    });

  }

});


// ==========================================
// CREATE VENUE
// POST /api/venues
//
// Also creates the first rating.
// ==========================================

router.post('/', requireAuth, async (req, res) => {

  const {
    name,
    category,
    lat,
    lng,
    score,
    access,
    toilet,
    measured_db,
    had_audio_clip
  } = req.body;


  // -------------------------
  // Validate required fields
  // -------------------------

  if (!name || !category) {

    return res.status(400).json({
      error: 'Venue name and category are required.'
    });

  }


  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const ratingScore = parseInt(score, 10);


  if (
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {

    return res.status(400).json({
      error: 'Valid latitude and longitude are required.'
    });

  }


  if (
    Number.isNaN(ratingScore) ||
    ratingScore < 1 ||
    ratingScore > 5
  ) {

    return res.status(400).json({
      error: 'Score must be between 1 and 5.'
    });

  }


  const client = await pool.connect();


  try {

    await client.query('BEGIN');


    // -------------------------
    // Insert venue
    //
    // IMPORTANT:
    // PostGIS uses longitude first,
    // then latitude.
    // -------------------------

    const venueResult = await client.query(
      `
      INSERT INTO venues (
        name,
        category,
        location,
        access,
        toilet,
        created_by
      )

      VALUES (
        $1,
        $2,
        ST_SetSRID(
          ST_MakePoint($3, $4),
          4326
        )::geography,
        $5,
        $6,
        $7
      )

      RETURNING
        id,
        name,
        category,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        access,
        toilet,
        created_at;
      `,
      [
        name.trim(),
        category,
        longitude,
        latitude,
        Boolean(access),
        Boolean(toilet),
        req.userId
      ]
    );


    const venue = venueResult.rows[0];


    // -------------------------
    // Insert initial rating
    // -------------------------

    await client.query(
      `
      INSERT INTO ratings (
        venue_id,
        user_id,
        score,
        time_of_day,
        measured_db,
        had_audio_clip
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      );
      `,
      [
        venue.id,
        req.userId,
        ratingScore,
        getCurrentTimeBucket(),
        measured_db !== null &&
        measured_db !== undefined
          ? parseFloat(measured_db)
          : null,
        Boolean(had_audio_clip)
      ]
    );


    await client.query('COMMIT');


    res.status(201).json({
      message: 'Venue created successfully.',
      venue: venue
    });


  } catch (error) {

    await client.query('ROLLBACK');

    console.error('Failed to create venue:', error);

    res.status(500).json({
      error: 'Could not create venue.'
    });

  } finally {

    client.release();

  }

});


// ==========================================
// ADD RATING TO EXISTING VENUE
// POST /api/venues/:id/ratings
// ==========================================

router.post(
  '/:id/ratings',
  requireAuth,
  async (req, res) => {

    const venueId = req.params.id;

    const {
      score,
      measured_db,
      had_audio_clip
    } = req.body;


    const ratingScore = parseInt(score, 10);


    if (
      Number.isNaN(ratingScore) ||
      ratingScore < 1 ||
      ratingScore > 5
    ) {

      return res.status(400).json({
        error: 'Score must be between 1 and 5.'
      });

    }


    try {

      // Check venue exists

      const venueCheck = await pool.query(
        `
        SELECT id
        FROM venues
        WHERE id = $1;
        `,
        [venueId]
      );


      if (!venueCheck.rows.length) {

        return res.status(404).json({
          error: 'Venue not found.'
        });

      }


      // Insert rating

      const result = await pool.query(
        `
        INSERT INTO ratings (
          venue_id,
          user_id,
          score,
          time_of_day,
          measured_db,
          had_audio_clip
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )

        RETURNING *;
        `,
        [
          venueId,
          req.userId,
          ratingScore,
          getCurrentTimeBucket(),
          measured_db !== null &&
          measured_db !== undefined
            ? parseFloat(measured_db)
            : null,
          Boolean(had_audio_clip)
        ]
      );


      res.status(201).json({
        message: 'Rating saved successfully.',
        rating: result.rows[0]
      });


    } catch (error) {

      console.error('Failed to save rating:', error);

      res.status(500).json({
        error: 'Could not save rating.'
      });

    }

  }
);


// ==========================================
// OPTIONAL: FIND NEARBY VENUES
// GET /api/venues/nearby?lat=...&lng=...
// ==========================================

router.get('/nearby/search', async (req, res) => {

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  const radius =
    parseFloat(req.query.radius) || 5000;


  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {

    return res.status(400).json({
      error: 'Valid latitude and longitude required.'
    });

  }


  try {

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        category,
        access,
        toilet,

        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,

        ST_Distance(
          location,
          ST_SetSRID(
            ST_MakePoint($1, $2),
            4326
          )::geography
        ) AS distance_meters

      FROM venues

      WHERE ST_DWithin(
        location,
        ST_SetSRID(
          ST_MakePoint($1, $2),
          4326
        )::geography,
        $3
      )

      ORDER BY distance_meters ASC;
      `,
      [
        lng,
        lat,
        radius
      ]
    );


    res.json(result.rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Could not find nearby venues.'
    });

  }

});


// ==========================================
// TIME OF DAY HELPER
// ==========================================

function getCurrentTimeBucket() {

  const hour = new Date().getHours();

  if (hour < 11) {
    return 'morning';
  }

  if (hour < 16) {
    return 'afternoon';
  }

  if (hour < 21) {
    return 'evening';
  }

  return 'night';

}


module.exports = router;