const jwt = require('jsonwebtoken');

/**
 * Middleware xác thực JWT Token.
 * Kiểm tra header Authorization: Bearer <token>
 * Nếu hợp lệ, gắn req.user = { userId, username } rồi chuyển sang handler tiếp theo.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" -> lấy TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Truy cập bị từ chối. Vui lòng đăng nhập để tiếp tục.'
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
        error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Token không hợp lệ. Vui lòng đăng nhập lại.'
    });
  }
};

module.exports = { authenticateToken };
