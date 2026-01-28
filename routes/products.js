const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Search products (public - for customers)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;

    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.category,
        COUNT(i.pharmacy_id) as pharmacy_count,
        SUM(i.quantity) as total_quantity
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id AND i.quantity > 0
      WHERE p.name ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1
      GROUP BY p.id, p.name, p.description, p.category
      ORDER BY p.name
      LIMIT 20
    `, [searchTerm]);

    res.json(result.rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get product availability in pharmacies (public)
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;

    const productResult = await pool.query(
      'SELECT id, name, description, category FROM products WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const availabilityResult = await pool.query(`
      SELECT 
        ph.id as pharmacy_id,
        ph.name as pharmacy_name,
        ph.address,
        ph.phone,
        i.quantity,
        i.price
      FROM inventory i
      JOIN pharmacies ph ON i.pharmacy_id = ph.id
      WHERE i.product_id = $1 AND i.quantity > 0
      ORDER BY i.quantity DESC, ph.name
    `, [id]);

    res.json({
      product: productResult.rows[0],
      availability: availabilityResult.rows
    });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all products (for pharmacists)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.category,
        p.created_at
      FROM products p
      ORDER BY p.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pharmacist's inventory
router.get('/my-inventory', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const pharmacyResult = await pool.query(
      'SELECT id FROM pharmacies WHERE pharmacist_id = $1',
      [req.user.id]
    );

    if (pharmacyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    const pharmacyId = pharmacyResult.rows[0].id;

    const result = await pool.query(`
      SELECT 
        i.id as inventory_id,
        i.quantity,
        i.price,
        i.updated_at,
        p.id as product_id,
        p.name as product_name,
        p.description,
        p.category
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.pharmacy_id = $1
      ORDER BY p.name
    `, [pharmacyId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add product to inventory
router.post('/inventory', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const { productId, quantity, price } = req.body;

    if (!productId || quantity === undefined || quantity < 0) {
      return res.status(400).json({ error: 'Product ID and valid quantity are required' });
    }

    const pharmacyResult = await pool.query(
      'SELECT id FROM pharmacies WHERE pharmacist_id = $1',
      [req.user.id]
    );

    if (pharmacyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    const pharmacyId = pharmacyResult.rows[0].id;

    // Check if product exists
    const productResult = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if already in inventory
    const existingResult = await pool.query(
      'SELECT id FROM inventory WHERE pharmacy_id = $1 AND product_id = $2',
      [pharmacyId, productId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Product already in inventory. Use PUT to update.' });
    }

    const result = await pool.query(`
      INSERT INTO inventory (pharmacy_id, product_id, quantity, price)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [pharmacyId, productId, quantity, price || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add to inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update inventory item
router.put('/inventory/:id', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, price } = req.body;

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    const pharmacyResult = await pool.query(
      'SELECT id FROM pharmacies WHERE pharmacist_id = $1',
      [req.user.id]
    );

    if (pharmacyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    const pharmacyId = pharmacyResult.rows[0].id;

    const result = await pool.query(`
      UPDATE inventory
      SET quantity = $1, price = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND pharmacy_id = $4
      RETURNING *
    `, [quantity, price || null, id, pharmacyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove from inventory
router.delete('/inventory/:id', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const { id } = req.params;

    const pharmacyResult = await pool.query(
      'SELECT id FROM pharmacies WHERE pharmacist_id = $1',
      [req.user.id]
    );

    if (pharmacyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    const pharmacyId = pharmacyResult.rows[0].id;

    const result = await pool.query(
      'DELETE FROM inventory WHERE id = $1 AND pharmacy_id = $2 RETURNING *',
      [id, pharmacyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ message: 'Item removed from inventory' });
  } catch (error) {
    console.error('Delete inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new product (admin-like, but available to pharmacists for simplicity)
router.post('/', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const { name, description, category } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const result = await pool.query(`
      INSERT INTO products (name, description, category)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, description || '', category || '']);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
