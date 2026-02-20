// Setup file for Jest tests
require('dotenv').config({ path: '.env.test' });

// Mock console methods in test
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-do-not-use';

// Test setup validation
describe('Test Environment Setup', () => {
  it('should have required environment variables', () => {
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_REFRESH_SECRET).toBeDefined();
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have mocked console methods', () => {
    console.log('test');
    console.error('test');
    console.warn('test');

    expect(global.console.log).toHaveBeenCalledWith('test');
    expect(global.console.error).toHaveBeenCalledWith('test');
    expect(global.console.warn).toHaveBeenCalledWith('test');
  });
});
