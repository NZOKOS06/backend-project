/**
 * Migration: add is_open to pharmacies, is_available to inventory.
 * Run once on existing DBs: node scripts/migrate-add-open-available.js
 */
const pool = require('../config/database');

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
    `);
    console.log('Migration completed.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
