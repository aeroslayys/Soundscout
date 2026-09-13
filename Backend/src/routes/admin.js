const express = require('express');

const router = express.Router();

const pool = require('../db');

const {
    requireAuth,
    requireAdmin
} = require('../middleware/adminAuth');


// ============================================================
// GET ALL VENUES
// ============================================================

router.get(
    '/venues',
    requireAuth,
    requireAdmin,
    async (req, res) => {

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
                    v.created_at,

                    COUNT(r.id) AS "ratingCount",

                    AVG(r.score) AS "averageScore"

                FROM venues v

                LEFT JOIN ratings r
                    ON r.venue_id = v.id

                GROUP BY
                    v.id,
                    v.name,
                    v.category,
                    v.location,
                    v.access,
                    v.toilet,
                    v.created_at

                ORDER BY v.created_at DESC;
            `);

            res.json(result.rows);

        } catch (err) {

            console.error(
                'Admin venue fetch error:',
                err
            );

            res.status(500).json({
                error: 'Failed to load venues.'
            });
        }
    }
);


// ============================================================
// DELETE VENUE
// ============================================================

router.delete(
    '/venues/:id',
    requireAuth,
    requireAdmin,
    async (req, res) => {

        try {

            const { id } = req.params;

            const result = await pool.query(
                `
                DELETE FROM venues
                WHERE id = $1
                RETURNING id, name;
                `,
                [id]
            );

            if (result.rowCount === 0) {

                return res.status(404).json({
                    error: 'Venue not found.'
                });
            }

            res.json({
                message: 'Venue deleted successfully.',
                venue: result.rows[0]
            });

        } catch (err) {

            console.error(
                'Admin venue deletion error:',
                err
            );

            res.status(500).json({
                error: 'Failed to delete venue.'
            });
        }
    }
);


module.exports = router;