const jwt = require('jsonwebtoken');
const pool = require('../db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.sub) return res.status(401).json({ error: 'Invalid token.' });

    const result = await pool.query(
      'SELECT id, email, is_suspended FROM users WHERE id = $1',
      [decoded.sub]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Account not found.' });
    if (result.rows[0].is_suspended === true) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    req.userId = result.rows[0].id;
    req.userEmail = result.rows[0].email;
    req.isAdmin = decoded.admin === true;
    next();
  } catch (err) {
    if (err && err.name === 'JsonWebTokenError' || err && err.name === 'TokenExpiredError' || err && err.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    console.error('Authentication lookup error:', err);
    return res.status(500).json({ error: 'Could not verify account status.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.isAdmin !== true) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
