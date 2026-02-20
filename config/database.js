const { Pool } = require('pg');
require('dotenv').config();

// Cloud PostgreSQL Database URL (Render)
const CLOUD_DATABASE_URL = 'postgresql://ma_base_production_user:fiVg1IQPYuiJXsFuetUrjz8yrTdsBbWc@dpg-d6ca8pjh46gs738apekg-a.frankfurt-postgres.render.com/ma_base_production';

/**
 * Database config compatible with:
 * - Local: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 * - Railway: DATABASE_URL (Postgres addon, SSL auto)
 * - Cloud: CLOUD_DATABASE_URL (hardcoded for production)
 */
const poolConfig = CLOUD_DATABASE_URL
  ? {
      connectionString: CLOUD_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
