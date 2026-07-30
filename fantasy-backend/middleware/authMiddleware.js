const jwt = require('jsonwebtoken');

/**
 * JWT token authentication middleware.
 * Checks the Authorization: Bearer <token> header.
 * If valid, attaches req.user = { userId, username } and passes control to the next handler.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" -> extract TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. Please log in to continue.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, username, iat, exp }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Your session has expired. Please log in again.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid token. Please log in again.'
    });
  }
};

module.exports = { authenticateToken };
