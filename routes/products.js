const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const logger = require('../src/logger');

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
        COUNT(DISTINCT ph.id) as pharmacy_count,
        COUNT(DISTINCT ph.id)::text as total_quantity
      FROM products p
      INNER JOIN inventory i ON p.id = i.product_id AND COALESCE(i.is_available, true) = true
      INNER JOIN pharmacies ph ON i.pharmacy_id = ph.id AND COALESCE(ph.is_open, true) = true
      WHERE p.name ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1
      GROUP BY p.id, p.name, p.description, p.category
      ORDER BY p.name
      LIMIT 20
    `, [searchTerm]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Search error', {
      error: error.message,
      searchTerm: req.query.q,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Get popular products (most available in open pharmacies - public)
router.get('/popular', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.category,
        COUNT(DISTINCT ph.id)::text as pharmacy_count,
        COUNT(DISTINCT ph.id)::text as total_quantity
      FROM products p
      INNER JOIN inventory i ON p.id = i.product_id AND COALESCE(i.is_available, true) = true
      INNER JOIN pharmacies ph ON i.pharmacy_id = ph.id AND COALESCE(ph.is_open, true) = true
      GROUP BY p.id, p.name, p.description, p.category
      ORDER BY COUNT(DISTINCT ph.id) DESC
      LIMIT 12
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error('Erreur récupération produits populaires', {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
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
        i.price,
        i.quantity,
        true as available
      FROM inventory i
      JOIN pharmacies ph ON i.pharmacy_id = ph.id
      WHERE i.product_id = $1
        AND COALESCE(i.is_available, true) = true
        AND COALESCE(ph.is_open, true) = true
      ORDER BY ph.name
    `, [id]);

    res.json({
      product: productResult.rows[0],
      availability: availabilityResult.rows
    });
  } catch (error) {
    logger.error('Availability error', {
      error: error.message,
      productId: req.params.id,
      ip: req.ip
    });
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
        COALESCE(i.is_available, true) as is_available,
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
    logger.error('Get inventory error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Add product to inventory
router.post('/inventory', authenticateToken, requireRole('pharmacist'), async (req, res) => {
  try {
    const { productId, quantity, price, is_available } = req.body;

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

    const available = is_available !== undefined ? !!is_available : true;
    const result = await pool.query(`
      INSERT INTO inventory (pharmacy_id, product_id, quantity, price, is_available)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [pharmacyId, productId, quantity, price || null, available]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add to inventory error', {
      error: error.message,
      userId: req.user?.id,
      productId: req.body.productId,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Validation middleware for inventory update
const updateInventoryValidation = [
  body('quantity').custom((value) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return true;
    throw new Error('Quantity must be a non-negative integer');
  }),
  body('price').optional().custom((value) => {
    if (value == null) return true;
    if (typeof value === 'number' && !isNaN(value) && value >= 0) return true;
    throw new Error('Price must be a non-negative number');
  }),
  body('is_available').optional().custom((value) => {
    if (value == null || typeof value === 'boolean') return true;
    throw new Error('is_available must be a boolean');
  })
];

// Update inventory item
router.put('/inventory/:id', authenticateToken, requireRole('pharmacist'), updateInventoryValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation de mise à jour d\'inventaire échouée', {
        errors: errors.array(),
        userId: req.user?.id,
        inventoryId: req.params.id,
        ip: req.ip
      });
      return res.status(400).json({
        error: 'Données d\'entrée invalides',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { quantity, price, is_available } = req.body;

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

    // Build dynamic update query
    let setClauses = ['quantity = $1', 'price = $2', 'updated_at = CURRENT_TIMESTAMP'];
    let setValues = [quantity, price || null];
    
    if (is_available !== undefined) {
      // Explicitly convert to boolean to ensure correct type for PostgreSQL
      const isAvailableBool = is_available === true || is_available === 'true' || is_available === 1 || is_available === '1';
      setClauses.push('is_available = $3');
      setValues.push(isAvailableBool);
    }
    
    // Add WHERE clause parameters
    setValues.push(id, pharmacyId);
    
    const whereClause = `WHERE id = $${setValues.length - 1} AND pharmacy_id = $${setValues.length}`;
    
    const result = await pool.query(
      `UPDATE inventory SET ${setClauses.join(', ')} ${whereClause} RETURNING *`,
      setValues
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update inventory error', {
      error: error.message,
      userId: req.user?.id,
      inventoryId: req.params.id,
      ip: req.ip
    });
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
    logger.error('Delete inventory error', {
      error: error.message,
      userId: req.user?.id,
      inventoryId: req.params.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Validation middleware for creating product
const createProductValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Product name is required and must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category must be less than 50 characters')
];

// Create new product (admin-like, but available to pharmacists for simplicity)
router.post('/', authenticateToken, requireRole('pharmacist'), createProductValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation de création de produit échouée', {
        errors: errors.array(),
        userId: req.user?.id,
        ip: req.ip
      });
      return res.status(400).json({
        error: 'Données d\'entrée invalides',
        details: errors.array()
      });
    }

    const { name, description, category, brand } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const result = await pool.query(`
      INSERT INTO products (name, description, category, brand)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description || '', category || '', brand || '']);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create product error', {
      error: error.message,
      userId: req.user?.id,
      productName: req.body.name,
      ip: req.ip
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all brands
router.get('/brands', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != \'\' ORDER BY brand');
    res.json(result.rows.map(row => row.brand));
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != \'\' ORDER BY category');
    res.json(result.rows.map(row => row.category));
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
