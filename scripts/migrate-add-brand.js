const pool = require('../config/database');

async function migrate() {
  try {
    console.log('Adding brand column to products table...');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100)');
    console.log('✅ Brand column added successfully');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    pool.end();
    process.exit(0);
  }
}

migrate();
