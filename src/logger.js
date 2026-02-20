const logger = {
  info: (message, meta = {}) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta),
  warn: (message, meta = {}) => console.log(`[WARN] ${new Date().toISOString()} - ${message}`, meta),
  error: (message, meta = {}) => console.log(`[ERROR] ${new Date().toISOString()} - ${message}`, meta),
};

module.exports = logger;
