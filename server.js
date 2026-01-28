const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

function validateEnv() {
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasDbVars =
    process.env.DB_HOST &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD;
  if (!hasDbUrl && !hasDbVars) {
    console.error(
      '❌ Missing DB config. Set DATABASE_URL (Railway) or DB_HOST, DB_NAME, DB_USER, DB_PASSWORD.'
    );
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is required. Set it in .env or Railway Variables.');
    process.exit(1);
  }
}

validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
app.use(
  corsOrigin
    ? cors({ origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true })
    : cors()
);
app.use(express.json());

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'PharmaStock API is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`📊 API: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api`);
  } else {
    console.log(`📊 API: http://localhost:${PORT}/api`);
  }
});
