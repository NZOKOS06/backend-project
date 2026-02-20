const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../src/tokenBlacklist');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // Check if token is blacklisted
  if (isTokenBlacklisted(token)) {
    return res.status(401).json({ error: 'Token has been revoked. Please login again.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please refresh.' });
    }
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

const validateInput = (req, res, next) => {
  const { body } = req;
  
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.length > 10000) {
      return res.status(400).json({ error: `${key} is too long` });
    }
  }
  
  next();
};

module.exports = { authenticateToken, requireRole, validateInput };
