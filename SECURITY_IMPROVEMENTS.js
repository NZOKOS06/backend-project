/**
 * Production Security Enhancements for PharmaStock
 * 
 * This file documents and implements critical security improvements
 */

// 1. INPUT VALIDATION
// ==================

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
};

const validatePassword = (password) => {
  // Minimum 8 characters, at least one uppercase, one number, one special char
  const re = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return re.test(password);
};

// 2. RATE LIMITING
// ================

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: 'Too many registrations, please try again later',
});

// 3. HELMET HEADERS
// =================

const helmet = require('helmet');

// Use in server.js:
// app.use(helmet());
// app.use(helmet.contentSecurityPolicy());

// 4. CORS CONFIGURATION
// =====================

const cors = require('cors');

const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
};

// Use in server.js:
// app.use(cors(corsOptions));

// 5. AUTHENTICATION IMPROVEMENTS
// ==============================

// Implement refresh token flow
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' } // Short-lived
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // Long-lived
  );

  return { accessToken, refreshToken };
};

// 6. TOKEN BLACKLIST (for logout)
// ==============================

// Using Redis (recommended for production)
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

const blacklistToken = async (token, expiresIn) => {
  await client.setex(`blacklist:${token}`, expiresIn, 'true');
};

const isTokenBlacklisted = async (token) => {
  const result = await client.get(`blacklist:${token}`);
  return result !== null;
};

// 7. ERROR MESSAGES
// =================

// NEVER leak specific error details in production
const SAFE_ERRORS = {
  LOGIN_FAILED: 'Invalid email or password',
  USER_EXISTS: 'An account with this email already exists',
  INVALID_EMAIL: 'Please provide a valid email address',
  WEAK_PASSWORD: 'Password must be at least 8 characters with uppercase, number, and special character',
  UNAUTHORIZED: 'You are not authorized to perform this action',
  SERVER_ERROR: 'An error occurred. Please try again later',
};

// 8. LOGGING (DON'T LOG SENSITIVE DATA)
// =====================================

const logger = {
  info: (message, meta = {}) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta),
  error: (message, error = {}) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, {
    // Don't log passwords, tokens, or sensitive data
    message: error.message,
    code: error.code,
  }),
  warn: (message, meta = {}) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta),
};

// 9. SECURE PASSWORD RESET
// ========================

const crypto = require('crypto');

const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Store reset tokens with expiration (1 hour)
const storeResetToken = async (email, token) => {
  await client.setex(`reset:${email}`, 3600, token);
};

// 10. ENVIRONMENT VARIABLES CHECKLIST
// ===================================

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CORS_ORIGINS',
  'REDIS_HOST',
  'REDIS_PORT',
  'NODE_ENV',
];

const validateEnvironment = () => {
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

module.exports = {
  validateEmail,
  validatePassword,
  loginLimiter,
  registerLimiter,
  corsOptions,
  generateTokens,
  blacklistToken,
  isTokenBlacklisted,
  logger,
  generateResetToken,
  storeResetToken,
  validateEnvironment,
  SAFE_ERRORS,
};
