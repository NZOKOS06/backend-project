const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../src/logger');

// Get open pharmacies (public - for customers)
router.get('/open', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ph.id,
        ph.name,
        ph.address,
        ph.phone,
        COUNT(i.id) as product_count
      FROM pharmacies ph
      LEFT JOIN inventory i ON ph.id = i.pharmacy_id AND COALESCE(i.is_available, true) = true
      WHERE COALESCE(ph.is_open, true) = true
      GROUP BY ph.id, ph.name, ph.address, ph.phone
      ORDER BY ph.name
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error('Open pharmacies error', {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
