const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { addToBlacklist } = require('../src/tokenBlacklist');
const logger = require('../src/logger');

// Validation functions
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
};

const validatePassword = (password) => {
  // Minimum 8 characters, at least one uppercase, one lowercase, one number, one special char
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return re.test(password);
};

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registrations, please try again later',
});

// Token generation
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Validation middleware pour l'enregistrement
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Format d\'email invalide'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Le mot de passe doit contenir au moins 8 caractères avec majuscule, minuscule, chiffre et caractère spécial'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Le nom est requis et doit être inférieur à 100 caractères')
];

// Register new customer
router.post('/register', registerLimiter, registerValidation, async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation d\'enregistrement échouée', {
        errors: errors.array(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(400).json({
        error: 'Données d\'entrée invalides',
        details: errors.array()
      });
    }

    const { email, password, name } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      logger.warn('Tentative d\'enregistrement avec email existant', {
        email: email,
        ip: req.ip
      });
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hashedPassword, name, 'customer']
    );

    const user = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(user);

    logger.info('Nouvel utilisateur enregistré', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('Erreur lors de l\'enregistrement', {
      error: error.message,
      stack: error.stack,
      email: req.body.email,
      ip: req.ip
    });
    res.status(500).json({ error: 'Une erreur est survenue. Veuillez réessayer plus tard.' });
  }
});

// Login with refresh token
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const result = await pool.query(
      'SELECT id, email, password, role, name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      email: req.body.email,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );

      const result = await pool.query(
        'SELECT id, email, role, name FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = result.rows[0];
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

      res.json({
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  } catch (error) {
    logger.error('Refresh error', {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});



// Logout with token invalidation
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Get the token from the authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      // Add token to blacklist
      addToBlacklist(token, 900); // 15 minutes (same as access token expiry)
      
      logger.info('User logged out', {
        userId: req.user.id,
        ip: req.ip
      });
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred during logout' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get user error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// Get pharmacist's pharmacy
router.get('/my-pharmacy', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'pharmacist') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      'SELECT id, name, address, phone, COALESCE(is_open, true) as is_open FROM pharmacies WHERE pharmacist_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get pharmacy error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// Update pharmacist's pharmacy
router.put('/my-pharmacy', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'pharmacist') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, address, phone, is_open } = req.body;

    const result = await pool.query(
      `UPDATE pharmacies 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           is_open = COALESCE($4, is_open)
       WHERE pharmacist_id = $5
       RETURNING id, name, address, phone, COALESCE(is_open, true) as is_open`,
      [name ?? null, address ?? null, phone ?? null, is_open !== undefined ? !!is_open : null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update pharmacy error:', error.message);
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

// Update user profile (name, email, and optionally password)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;

    // Handle password change
    if (currentPassword && newPassword) {
      // Get current user with password
      const userResult = await pool.query(
        'SELECT password FROM users WHERE id = $1',
        [req.user.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password along with other fields
      const result = await pool.query(
        `UPDATE users 
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             password = $3
         WHERE id = $4
         RETURNING id, email, name, role`,
        [name ?? null, email ?? null, hashedPassword, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('Profile and password updated', {
        userId: req.user.id,
        ip: req.ip
      });

      return res.json(result.rows[0]);
    }

    // Handle profile update without password change
    // Check if email is being changed and if it's already taken
    if (email && email !== req.user.email) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, email, name, role`,
      [name ?? null, email ?? null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('Profile updated', {
      userId: req.user.id,
      ip: req.ip
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update profile error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });
    res.status(500).json({ error: 'An error occurred. Please try again later.' });
  }
});

module.exports = router;
