const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../config/database');
const logger = require('../src/logger');

// Apply admin role check to all routes
router.use(authenticateToken, requireRole('admin'));

// ==================== STATISTICS ====================

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total users count
    const usersResult = await pool.query(
      'SELECT role, COUNT(*) as count FROM users GROUP BY role'
    );

    // Get total pharmacies count
    const pharmaciesResult = await pool.query(
      'SELECT COUNT(*) as count FROM pharmacies'
    );

    // Get open pharmacies count
    const openPharmaciesResult = await pool.query(
      "SELECT COUNT(*) as count FROM pharmacies WHERE COALESCE(is_open, true) = true"
    );

    // Get total products count
    const productsResult = await pool.query(
      'SELECT COUNT(*) as count FROM products'
    );

    // Get total inventory items
    const inventoryResult = await pool.query(
      'SELECT COUNT(*) as count FROM inventory'
    );

    // Parse user counts
    let customersCount = 0;
    let pharmacistsCount = 0;
    let adminsCount = 0;

    usersResult.rows.forEach(row => {
      if (row.role === 'customer') customersCount = parseInt(row.count);
      if (row.role === 'pharmacist') pharmacistsCount = parseInt(row.count);
      if (row.role === 'admin') adminsCount = parseInt(row.count);
    });

    res.json({
      users: {
        total: customersCount + pharmacistsCount + adminsCount,
        customers: customersCount,
        pharmacists: pharmacistsCount,
        admins: adminsCount
      },
      pharmacies: {
        total: parseInt(pharmaciesResult.rows[0]?.count || 0),
        open: parseInt(openPharmaciesResult.rows[0]?.count || 0)
      },
      products: parseInt(productsResult.rows[0]?.count || 0),
      inventory: parseInt(inventoryResult.rows[0]?.count || 0)
    });
  } catch (error) {
    logger.error('Admin stats error', {
      error: error.message,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== USERS MANAGEMENT ====================

// Get all users with pagination
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, role } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, email, name, role, created_at FROM users';
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    let params = [];
    let paramIndex = 1;

    if (role) {
      query += ` WHERE role = $${paramIndex}`;
      countQuery += ` WHERE role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const [usersResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, role ? [role] : [])
    ]);

    res.json({
      users: usersResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    });
  } catch (error) {
    logger.error('Admin get users error', {
      error: error.message,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Get additional info based on role
    const user = result.rows[0];
    
    if (user.role === 'pharmacist') {
      const pharmacyResult = await pool.query(
        'SELECT id, name, address, phone, is_open FROM pharmacies WHERE pharmacist_id = $1',
        [id]
      );
      user.pharmacy = pharmacyResult.rows[0] || null;
    }

    res.json(user);
  } catch (error) {
    logger.error('Admin get user error', {
      error: error.message,
      userId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // If user is a pharmacist, delete their pharmacy too
    if (userResult.rows[0].role === 'pharmacist') {
      await pool.query('DELETE FROM pharmacies WHERE pharmacist_id = $1', [id]);
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    logger.info('User deleted by admin', {
      deletedUserId: id,
      adminId: req.user.id,
      ip: req.ip
    });

    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    logger.error('Admin delete user error', {
      error: error.message,
      userId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== PHARMACIES MANAGEMENT ====================

// Get all pharmacies with pagination
router.get('/pharmacies', async (req, res) => {
  try {
    const { page = 1, limit = 20, is_open } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        ph.id,
        ph.name,
        ph.address,
        ph.phone,
        COALESCE(ph.is_open, true) as is_open,
        ph.created_at,
        u.id as pharmacist_id,
        u.name as pharmacist_name,
        u.email as pharmacist_email,
        (SELECT COUNT(*) FROM inventory WHERE pharmacy_id = ph.id) as inventory_count
      FROM pharmacies ph
      LEFT JOIN users u ON ph.pharmacist_id = u.id
    `;
    
    let countQuery = 'SELECT COUNT(*) as total FROM pharmacies';
    let params = [];
    let paramIndex = 1;

    if (is_open !== undefined) {
      const openValue = is_open === 'true';
      query += ` WHERE COALESCE(ph.is_open, true) = $${paramIndex}`;
      countQuery += ` WHERE COALESCE(is_open, true) = $${paramIndex}`;
      params.push(openValue);
      paramIndex++;
    }

    query += ` ORDER BY ph.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const [pharmaciesResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, is_open !== undefined ? [is_open === 'true'] : [])
    ]);

    res.json({
      pharmacies: pharmaciesResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    });
  } catch (error) {
    logger.error('Admin get pharmacies error', {
      error: error.message,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get pharmacy by ID
router.get('/pharmacies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        ph.id,
        ph.name,
        ph.address,
        ph.phone,
        COALESCE(ph.is_open, true) as is_open,
        ph.created_at,
        u.id as pharmacist_id,
        u.name as pharmacist_name,
        u.email as pharmacist_email
      FROM pharmacies ph
      LEFT JOIN users u ON ph.pharmacist_id = u.id
      WHERE ph.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacie non trouvée' });
    }

    // Get pharmacy inventory
    const inventoryResult = await pool.query(
      `SELECT 
        i.id,
        i.quantity,
        i.price,
        i.is_available,
        p.id as product_id,
        p.name as product_name,
        p.category
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.pharmacy_id = $1
      ORDER BY p.name`,
      [id]
    );

    const pharmacy = result.rows[0];
    pharmacy.inventory = inventoryResult.rows;

    res.json(pharmacy);
  } catch (error) {
    logger.error('Admin get pharmacy error', {
      error: error.message,
      pharmacyId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create new pharmacy (admin creates it, then can assign to a pharmacist)
router.post('/pharmacies', async (req, res) => {
  try {
    const { name, address, phone, pharmacist_id } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Nom et adresse requis' });
    }

    // If pharmacist_id provided, verify the user exists and is a pharmacist
    if (pharmacist_id) {
      const userResult = await pool.query(
        'SELECT id, role FROM users WHERE id = $1',
        [pharmacist_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      if (userResult.rows[0].role !== 'pharmacist') {
        return res.status(400).json({ error: 'L\'utilisateur doit être un pharmacien' });
      }

      // Check if pharmacist already has a pharmacy
      const existingPharmacy = await pool.query(
        'SELECT id FROM pharmacies WHERE pharmacist_id = $1',
        [pharmacist_id]
      );

      if (existingPharmacy.rows.length > 0) {
        return res.status(400).json({ error: 'Ce pharmacien a déjà une pharmacie' });
      }
    }

    const result = await pool.query(
      `INSERT INTO pharmacies (name, address, phone, pharmacist_id, is_open) 
       VALUES ($1, $2, $3, $4, true) 
       RETURNING *`,
      [name, address, phone || null, pharmacist_id || null]
    );

    logger.info('Pharmacy created by admin', {
      pharmacyId: result.rows[0].id,
      adminId: req.user.id,
      ip: req.ip
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Admin create pharmacy error', {
      error: error.message,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// CREATE PHARMACY WITH A NEW PHARMACIST USER
router.post('/create-pharmacy-with-user', async (req, res) => {
  const {
    pharmacyName,
    pharmacyAddress,
    pharmacyPhone,
    pharmacistName,
    pharmacistEmail,
    pharmacistPassword
  } = req.body;

  if (!pharmacyName || !pharmacyAddress || !pharmacistName || !pharmacistEmail || !pharmacistPassword) {
    return res.status(400).json({
      error: 'Missing required fields for pharmacy or pharmacist.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if user email already exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [pharmacistEmail]);
    if (existingUser.rows.length > 0) {
      throw new Error('An account with this email already exists.');
    }

    // 2. Create the new pharmacist user
    const hashedPassword = await bcrypt.hash(pharmacistPassword, 12);
    const userResult = await client.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [pharmacistEmail, hashedPassword, pharmacistName, 'pharmacist']
    );
    const newUserId = userResult.rows[0].id;

    // 3. Create the new pharmacy and assign the new user to it
    const pharmacyResult = await client.query(
      'INSERT INTO pharmacies (name, address, phone, pharmacist_id, is_open) VALUES ($1, $2, $3, $4, true) RETURNING *',
      [pharmacyName, pharmacyAddress, pharmacyPhone, newUserId]
    );

    await client.query('COMMIT');

    logger.info('Pharmacy with new user created by admin', {
      pharmacyId: pharmacyResult.rows[0].id,
      userId: newUserId,
      adminId: req.user.id,
      ip: req.ip
    });

    res.status(201).json({
      message: 'Pharmacy and pharmacist account created successfully.',
      pharmacy: pharmacyResult.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Admin create pharmacy with user error', {
      error: error.message,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({
      error: error.message || 'Server error during the creation process.'
    });
  } finally {
    client.release();
  }
});


// Update pharmacy
router.put('/pharmacies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, is_open, pharmacist_id } = req.body;

    // Check if pharmacy exists
    const existingResult = await pool.query(
      'SELECT id FROM pharmacies WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacie non trouvée' });
    }

    // If changing pharmacist, verify the new pharmacist
    if (pharmacist_id) {
      const userResult = await pool.query(
        'SELECT id, role FROM users WHERE id = $1',
        [pharmacist_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      if (userResult.rows[0].role !== 'pharmacist') {
        return res.status(400).json({ error: 'L\'utilisateur doit être un pharmacien' });
      }

      // Check if pharmacist already has a pharmacy (excluding this one)
      const existingPharmacy = await pool.query(
        'SELECT id FROM pharmacies WHERE pharmacist_id = $1 AND id != $2',
        [pharmacist_id, id]
      );

      if (existingPharmacy.rows.length > 0) {
        return res.status(400).json({ error: 'Ce pharmacien a déjà une pharmacie' });
      }
    }

    const result = await pool.query(
      `UPDATE pharmacies 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           is_open = COALESCE($4, is_open),
           pharmacist_id = CASE WHEN $5 IS NOT NULL THEN $5 ELSE pharmacist_id END
       WHERE id = $6
       RETURNING *`,
      [name, address, phone, is_open !== undefined ? !!is_open : null, pharmacist_id, id]
    );

    logger.info('Pharmacy updated by admin', {
      pharmacyId: id,
      adminId: req.user.id,
      ip: req.ip
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Admin update pharmacy error', {
      error: error.message,
      pharmacyId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Toggle pharmacy open/close status
router.patch('/pharmacies/:id/toggle-open', async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const currentResult = await pool.query(
      'SELECT is_open FROM pharmacies WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacie non trouvée' });
    }

    const currentStatus = currentResult.rows[0].is_open !== false; // Default to true if null
    const newStatus = !currentStatus;

    const result = await pool.query(
      'UPDATE pharmacies SET is_open = $1 WHERE id = $2 RETURNING *',
      [newStatus, id]
    );

    logger.info('Pharmacy open status toggled by admin', {
      pharmacyId: id,
      newStatus: newStatus,
      adminId: req.user.id,
      ip: req.ip
    });

    res.json({
      message: newStatus ? 'Pharmacie ouverte' : 'Pharmacie fermée',
      pharmacy: result.rows[0]
    });
  } catch (error) {
    logger.error('Admin toggle pharmacy error', {
      error: error.message,
      pharmacyId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete pharmacy
router.delete('/pharmacies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if pharmacy exists
    const existingResult = await pool.query(
      'SELECT id FROM pharmacies WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacie non trouvée' });
    }

    // Delete pharmacy (inventory will be deleted automatically due to CASCADE)
    await pool.query('DELETE FROM pharmacies WHERE id = $1', [id]);

    logger.info('Pharmacy deleted by admin', {
      pharmacyId: id,
      adminId: req.user.id,
      ip: req.ip
    });

    res.json({ message: 'Pharmacie supprimée avec succès' });
  } catch (error) {
    logger.error('Admin delete pharmacy error', {
      error: error.message,
      pharmacyId: req.params.id,
      adminId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CREATE ADMIN ACCOUNT ====================

// Route to create initial admin account (should be protected in production)
router.post('/init-admin', async (req, res) => {
  try {
    const { email, password, name, secret_key } = req.body;

    // Secret key to prevent unauthorized admin creation
    const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'pharmastock-admin-secret-2024';
    
    if (secret_key !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Clé secrète invalide' });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom requis' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hashedPassword, name, 'admin']
    );

    logger.info('Admin account created', {
      adminId: result.rows[0].id,
      email: email,
      ip: req.ip
    });

    res.status(201).json({
      message: 'Compte admin créé avec succès',
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Admin init error', {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
