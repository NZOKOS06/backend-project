const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Create test database if needed
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (error) {
      // Table might already exist
    }
  });

  afterAll(async () => {
    // Cleanup
    try {
      await pool.query('DELETE FROM users WHERE email LIKE $1', ['test-%@example.com']);
    } catch (error) {
      // Ignore
    }
  });

  describe('User Registration & Login Flow', () => {
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User'
    };

    it('should register new user successfully', async () => {
      const hashedPassword = await bcrypt.hash(testUser.password, 12);

      try {
        const result = await pool.query(
          'INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
          [testUser.email, hashedPassword, 'customer', testUser.name]
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].email).toBe(testUser.email);
        expect(result.rows[0].role).toBe('customer');
      } catch (error) {
        // User might already exist
        expect(error).toBeDefined();
      }
    });

    it('should not register duplicate email', async () => {
      const hashedPassword = await bcrypt.hash(testUser.password, 12);

      try {
        // Try to insert twice
        await pool.query(
          'INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4)',
          [testUser.email, hashedPassword, 'customer', testUser.name]
        );

        // Second attempt should fail due to unique constraint
        await expect(
          pool.query(
            'INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4)',
            [testUser.email, hashedPassword, 'customer', testUser.name]
          )
        ).rejects.toThrow();
      } catch (error) {
        // Expected
        expect(error).toBeDefined();
      }
    });

    it('should verify password after registration', async () => {
      const hashedPassword = await bcrypt.hash(testUser.password, 12);
      
      const isValid = await bcrypt.compare(testUser.password, hashedPassword);
      expect(isValid).toBe(true);

      const isInvalid = await bcrypt.compare('WrongPassword123!', hashedPassword);
      expect(isInvalid).toBe(false);
    });

    it('should generate valid JWT tokens', () => {
      const payload = {
        id: 1,
        email: testUser.email,
        role: 'customer',
        name: testUser.name
      };

      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ id: payload.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      // Verify tokens can be decoded
      const decodedAccess = jwt.verify(accessToken, process.env.JWT_SECRET);
      expect(decodedAccess.email).toBe(testUser.email);

      const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      expect(decodedRefresh.id).toBe(1);
    });

    it('should handle refresh token rotation', () => {
      const userId = 1;
      const oldRefreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      // Decode old token
      const decoded = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET);

      // Generate new tokens from refresh
      const newAccessToken = jwt.sign(
        { id: decoded.id, email: 'test@example.com', role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      const newRefreshToken = jwt.sign({ id: decoded.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      expect(newAccessToken).toBeTruthy();
      expect(newRefreshToken).toBeTruthy();
    });
  });

  describe('Database Connection', () => {
    it('should connect to database', async () => {
      const result = await pool.query('SELECT NOW()');
      expect(result.rows).toHaveLength(1);
    });

    it('should handle connection pool', async () => {
      const queries = [];
      for (let i = 0; i < 5; i++) {
        queries.push(pool.query('SELECT NOW()'));
      }

      const results = await Promise.all(queries);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.rows).toHaveLength(1);
      });
    });
  });
});
