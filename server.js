const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./src/logger');

dotenv.config({ path: path.join(__dirname, '.env') });

// Cloud Database URL (Render PostgreSQL)
const CLOUD_DATABASE_URL = 'postgresql://ma_base_production_user:fiVg1IQPYuiJXsFuetUrjz8yrTdsBbWc@dpg-d6ca8pjh46gs738apekg-a.frankfurt-postgres.render.com/ma_base_production';

function validateEnv() {
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasCloudDbUrl = !!CLOUD_DATABASE_URL;
  const hasDbVars =
    process.env.DB_HOST &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD;
  if (!hasDbUrl && !hasDbVars && !hasCloudDbUrl) {
    logger.error('Configuration de base de données manquante', {
      hasDbUrl,
      hasDbVars,
      hasCloudDbUrl
    });
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET requis', {
      hasJwtSecret: !!process.env.JWT_SECRET
    });
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN && !process.env.FRONTEND_URL) {
    logger.warn('CORS_ORIGIN ou FRONTEND_URL non défini en production - utilisation des origines par défaut');
  }
}

validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Security: Helmet headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
const allowedOrigins = corsOrigin
  ? corsOrigin.split(',').map((o) => o.trim())
  : (process.env.NODE_ENV === 'production'
      ? [] // En production, aucune origine par défaut
      : ['http://localhost:3000', 'http://localhost:5173', 'http://192.168.1.126:8081']
    );

const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (comme les apps mobiles ou Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.length === 0) {
      callback(null, true);
    } else {
      logger.warn('Origine CORS rejetée', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // Cache preflight pendant 24h
};

app.use(cors(corsOptions));

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const pharmacyRoutes = require('./routes/pharmacies');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pharmacies', pharmacyRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'PharmaStock API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Erreur non gérée', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Une erreur est survenue. Veuillez réessayer plus tard.'
    : err.message;

  res.status(err.status || 500).json({ error: message });
});

// Export the app for testing
module.exports = app;

if (require.main === module) {
  app.listen(Number(PORT), HOST, () => {
    console.log(` Server running on ${HOST}:${PORT}`);
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      console.log(` API: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api`);
    } else {
      console.log(` API: http://localhost:${PORT}/api`);
    }
  });
}
