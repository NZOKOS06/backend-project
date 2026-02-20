const request = require('supertest');
const app = require('../server');

jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const pool = require('../config/database');

describe('Products Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/products/search', () => {
    it('should search products by name', async () => {
      pool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Aspirin', category: 'Pain Relief', price: 5.99 }
        ]
      });

      const res = await request(app)
        .get('/api/products/search')
        .query({ q: 'Aspirin' });

      expect(res.statusCode).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].name).toBe('Aspirin');
    });

    it('should handle no search results', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/products/search')
        .query({ q: 'NonexistentProduct' });

      expect(res.statusCode).toBe(200);
      expect(res.body.products).toHaveLength(0);
    });

    it('should validate search query length', async () => {
      const res = await request(app)
        .get('/api/products/search')
        .query({ q: '' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .get('/api/products/search')
        .query({ q: 'test' });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/products/popular', () => {
    it('should get popular products', async () => {
      pool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Product1', sales: 100 },
          { id: 2, name: 'Product2', sales: 90 }
        ]
      });

      const res = await request(app)
        .get('/api/products/popular');

      expect(res.statusCode).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBeGreaterThanOrEqual(0);
    });

    it('should apply limit parameter', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Product1', sales: 100 }]
      });

      const res = await request(app)
        .get('/api/products/popular')
        .query({ limit: 5 });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get product by ID', async () => {
      pool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Aspirin', description: 'Pain relief', price: 5.99 }
        ]
      });

      const res = await request(app)
        .get('/api/products/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.id).toBe(1);
    });

    it('should return 404 for non-existent product', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/products/999');

      expect(res.statusCode).toBe(404);
    });
  });
});
