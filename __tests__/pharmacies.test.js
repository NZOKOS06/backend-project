const request = require('supertest');
const app = require('../server');
const jwt = require('jsonwebtoken');

jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const pool = require('../config/database');

describe('Pharmacies Routes', () => {
  let pharmacistToken;

  beforeAll(() => {
    pharmacistToken = jwt.sign(
      { id: 1, email: 'pharmacist@test.com', role: 'pharmacist' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/pharmacies/open', () => {
    it('should return only open pharmacies', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Pharmacy 1',
            is_open: true,
            address: '123 Main St',
            phone: '555-1234'
          }
        ]
      });

      const res = await request(app)
        .get('/api/pharmacies/open');

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacies).toBeDefined();
      expect(res.body.pharmacies[0].is_open).toBe(true);
    });

    it('should filter by location if provided', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Pharmacy Near You',
            is_open: true,
            address: '123 Main St'
          }
        ]
      });

      const res = await request(app)
        .get('/api/pharmacies/open')
        .query({ lat: 48.8566, lon: 2.3522, radius: 5 });

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacies).toBeDefined();
    });

    it('should return empty array if no open pharmacies', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/pharmacies/open');

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacies).toHaveLength(0);
    });
  });

  describe('GET /api/pharmacies/search', () => {
    it('should search pharmacies by name', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Pharmacy Central',
            address: '456 Oak Ave',
            phone: '555-5678'
          }
        ]
      });

      const res = await request(app)
        .get('/api/pharmacies/search')
        .query({ q: 'Central' });

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacies).toBeDefined();
      expect(res.body.pharmacies[0].name).toContain('Central');
    });

    it('should validate search query minimum length', async () => {
      const res = await request(app)
        .get('/api/pharmacies/search')
        .query({ q: 'P' });

      expect(res.statusCode).toBe(400);
    });

    it('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .get('/api/pharmacies/search')
        .query({ q: 'Test' });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/pharmacies/:id', () => {
    it('should get pharmacy details', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Test Pharmacy',
            address: '789 Pine Rd',
            phone: '555-1234',
            is_open: true
          }
        ]
      });

      const res = await request(app)
        .get('/api/pharmacies/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacy).toBeDefined();
      expect(res.body.pharmacy.name).toBe('Test Pharmacy');
      expect(res.body.pharmacy.phone).toBe('555-1234');
    });

    it('should return 404 for non-existent pharmacy', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/pharmacies/999');

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBeTruthy();
    });

    it('should validate pharmacy ID format', async () => {
      const res = await request(app)
        .get('/api/pharmacies/invalid-id');

      expect(res.statusCode).toBe(400);
    });

    it('should include pharmacy operating hours', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Test Pharmacy',
            address: '789 Pine Rd',
            opening_time: '09:00',
            closing_time: '22:00',
            is_24h: false
          }
        ]
      });

      const res = await request(app)
        .get('/api/pharmacies/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacy.opening_time).toBe('09:00');
    });
  });

  describe('PUT /api/pharmacies/:id (pharmacist only)', () => {
    it('should allow pharmacist to update pharmacy info', async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            name: 'Updated Pharmacy',
            address: 'New Address',
            phone: '555-9999'
          }
        ]
      });

      const res = await request(app)
        .put('/api/pharmacies/1')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: 'Updated Pharmacy',
          address: 'New Address',
          phone: '555-9999'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.pharmacy).toBeDefined();
    });

    it('should reject unauthorized users', async () => {
      const res = await request(app)
        .put('/api/pharmacies/1')
        .send({
          name: 'Updated Pharmacy',
          address: 'New Address'
        });

      expect(res.statusCode).toBe(401);
    });

    it('should validate update data', async () => {
      const res = await request(app)
        .put('/api/pharmacies/1')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: '',
          address: ''
        });

      expect(res.statusCode).toBe(400);
    });

    it('should handle database update errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .put('/api/pharmacies/1')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: 'Updated',
          address: 'New'
        });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('Pharmacies Error Handling', () => {
    it('should not expose sensitive data in errors', async () => {
      pool.query.mockRejectedValue(new Error('Connection string: postgresql://...'));

      const res = await request(app)
        .get('/api/pharmacies/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toContain('postgresql');
    });

    it('should handle missing database results gracefully', async () => {
      pool.query.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/pharmacies/1');

      expect([404, 500]).toContain(res.statusCode);
    });
  });
});
