const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Authentication required.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.userId = decoded.sub;
        req.userEmail = decoded.email;
        req.isAdmin = decoded.admin === true;

        next();

    } catch (err) {
        return res.status(401).json({
            error: 'Invalid or expired token.'
        });
    }
}


function requireAdmin(req, res, next) {

    if (req.isAdmin !== true) {
        return res.status(403).json({
            error: 'Admin access required.'
        });
    }

    next();
}


module.exports = {
    requireAuth,
    requireAdmin
};