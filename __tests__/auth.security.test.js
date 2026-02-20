const request = require('supertest');
const app = require('../server');
const bcrypt = require('bcryptjs');

jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const pool = require('../config/database');

describe('Authentication Security Tests', () => {
  beforeAll(async () => {
    // Mock database for tests
    pool.query.mockResolvedValue({ rows: [] });
  });

  describe('Input Validation', () => {
    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'ValidPassword123!'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('email');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject SQL injection in email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: "' OR '1'='1",
          password: 'password'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit after 5 failed login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
      }

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      expect(res.statusCode).toBe(429);
    });
  });

  describe('Token Security', () => {
    let authToken;
    let refreshToken;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sectest@example.com',
          password: 'TestPassword123!'
        });

      authToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should return both access and refresh tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sectest@example.com',
          password: 'TestPassword123!'
        });

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should reject requests without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid token format', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(403);
    });

    it('should refresh token successfully', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('CORS Headers', () => {
    it('should set appropriate CORS headers', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('Password Hashing', () => {
    it('should use bcrypt for password hashing', async () => {
      const password = 'TestPassword123!';
      const hashed = await bcrypt.hash(password, 12);

      expect(hashed).not.toEqual(password);
      expect(hashed).toMatch(/^\$2[aby]\$/);
    });

    it('should validate password correctly', async () => {
      const password = 'TestPassword123!';
      const hashed = await bcrypt.hash(password, 12);
      const isValid = await bcrypt.compare(password, hashed);

      expect(isValid).toBe(true);
    });
  });

  describe('Error Messages', () => {
    it('should not leak database errors', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.body.error).not.toContain('SELECT');
      expect(res.body.error).not.toContain('UPDATE');
    });

    it('should return generic error for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password'
        });

      // Same message for non-existent user and wrong password
      expect(res.body.error).toEqual('Invalid email or password');
    });
  });

  // ==================== ADDITIONAL TESTS TO INCREASE COVERAGE ====================

  describe('Register Endpoint', () => {
    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'weak',
          name: 'New User'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123!',
          name: 'New User'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject registration with missing name', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'TestPassword123!'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject duplicate email registration', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'TestPassword123!',
          name: 'Existing User'
        });

      expect(res.statusCode).toBe(409);
    });

    it('should successfully register new user', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [{ id: 2, email: 'new@example.com', name: 'New User', role: 'customer' }] }); // Insert user

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'new@example.com',
          password: 'TestPassword123!',
          name: 'New User'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toHaveProperty('id');
    });
  });

  describe('Logout Endpoint', () => {
    it('should reject logout without token', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.statusCode).toBe(401);
    });

    it('should successfully logout with valid token', async () => {
      // First login to get a token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sectest@example.com',
          password: 'TestPassword123!'
        });

      const token = loginRes.body.accessToken;

      // Then logout
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
    });

    it('should reject logout with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Get Current User (/me)', () => {
    it('should get current user with valid token', async () => {
      // First login to get a token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sectest@example.com',
          password: 'TestPassword123!'
        });

      const token = loginRes.body.accessToken;

      // Then get current user
      pool.query.mockResolvedValueOnce({ 
        rows: [{ id: 1, email: 'sectest@example.com', name: 'Test User', role: 'customer' }] 
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('email');
    });

    it('should return 404 for non-existent user', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sectest@example.com',
          password: 'TestPassword123!'
        });

      const token = loginRes.body.accessToken;

      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Health Check', () => {
    it('should return OK status', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
    });
  });

  describe('Refresh Token Edge Cases', () => {
    it('should reject refresh without token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.statusCode).toBe(401);
    });
  });
});
