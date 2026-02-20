const jwt = require('jsonwebtoken');
const { authenticateToken, requireRole, validateInput } = require('../middleware/auth');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  describe('authenticateToken', () => {
    it('should reject request without token', () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied. No token provided.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should extract token from Authorization header', () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com', role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      req.headers['authorization'] = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(req.user).toEqual({
        id: 1,
        email: 'test@example.com',
        role: 'customer',
        iat: expect.any(Number),
        exp: expect.any(Number)
      });
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      req.headers['authorization'] = 'Bearer invalid-token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token.'
      });
    });

    it('should handle expired token', () => {
      const expiredToken = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      req.headers['authorization'] = `Bearer ${expiredToken}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token expired. Please refresh.'
      });
    });
  });

  describe('requireRole', () => {
    it('should allow access for authorized role', () => {
      req.user = { role: 'pharmacist' };

      const middleware = requireRole('pharmacist');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access for multiple allowed roles', () => {
      req.user = { role: 'admin' };

      const middleware = requireRole('admin', 'pharmacist');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access for unauthorized role', () => {
      req.user = { role: 'customer' };

      const middleware = requireRole('pharmacist');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied. Insufficient permissions.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject if no user authenticated', () => {
      const middleware = requireRole('pharmacist');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });
  });

  describe('validateInput', () => {
    it('should allow valid input', () => {
      req.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!'
      };

      validateInput(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject too long strings', () => {
      req.body = {
        email: 'a'.repeat(10001)
      };

      validateInput(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'email is too long'
      });
    });

    it('should allow reasonable input', () => {
      req.body = {
        name: 'Test User',
        email: 'test@example.com',
        description: 'A'.repeat(5000)
      };

      validateInput(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
