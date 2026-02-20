// Token blacklist module
// In production, use Redis for multi-instance support
// For single instance, this in-memory Set works fine

const tokenBlacklist = new Set();

// Helper function to add token to blacklist
const addToBlacklist = (token, expiresInSeconds = 900) => {
  tokenBlacklist.add(token);
  
  // Clean up expired tokens automatically
  const expiresInMs = expiresInSeconds * 1000;
  setTimeout(() => {
    tokenBlacklist.delete(token);
  }, expiresInMs);
};

// Check if token is blacklisted
const isTokenBlacklisted = (token) => {
  return tokenBlacklist.has(token);
};

module.exports = {
  tokenBlacklist,
  addToBlacklist,
  isTokenBlacklisted
};
