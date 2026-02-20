/**
 * Quick Security Tests for PharmaStock Backend
 * Run: node test-security.js
 */

const http = require('http');
const url = require('url');

const API_BASE = 'http://localhost:5000/api';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = url.parse(`${API_BASE}${path}`);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null
        });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function test(description, method, path, data, expectedStatus) {
  testsRun++;
  
  try {
    const response = await makeRequest(method, path, data);
    
    if (response.status === expectedStatus) {
      console.log(`✓ ${description}`);
      testsPassed++;
      return true;
    } else {
      console.log(`✗ ${description}`);
      console.log(`  Expected: ${expectedStatus}, Got: ${response.status}`);
      testsFailed++;
      return false;
    }
  } catch (error) {
    console.log(`✗ ${description} - Error: ${error.message}`);
    testsFailed++;
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('PharmaStock - Security Tests');
  console.log('========================================\n');

  // Test connectivity
  console.log('Basic Connectivity:');
  await test('Health check', 'GET', '/health', null, 200);

  // Input validation
  console.log('\nInput Validation:');
  await test(
    'Invalid email format',
    'POST',
    '/auth/login',
    { email: 'invalid-email', password: 'Test123!' },
    400
  );

  await test(
    'Missing password',
    'POST',
    '/auth/login',
    { email: 'test@example.com' },
    400
  );

  // SQL injection
  console.log('\nSQL Injection Protection:');
  await test(
    'SQL injection attempt',
    'POST',
    '/auth/login',
    { email: "' OR '1'='1", password: 'password' },
    400
  );

  await test(
    'Boolean-based injection',
    'POST',
    '/auth/login',
    { email: "admin'--", password: 'password' },
    400
  );

  // CORS & Security Headers
  console.log('\nSecurity Headers:');
  const healthRes = await makeRequest('GET', '/health');
  
  if (healthRes.headers['access-control-allow-origin']) {
    console.log('✓ CORS headers present');
    testsPassed++;
  } else {
    console.log('✗ CORS headers missing');
    testsFailed++;
  }
  testsRun++;

  if (healthRes.headers['x-frame-options']) {
    console.log('✓ X-Frame-Options header present');
    testsPassed++;
  } else {
    console.log('✗ X-Frame-Options header missing');
    testsFailed++;
  }
  testsRun++;

  if (healthRes.headers['x-content-type-options']) {
    console.log('✓ X-Content-Type-Options header present');
    testsPassed++;
  } else {
    console.log('✗ X-Content-Type-Options header missing');
    testsFailed++;
  }
  testsRun++;

  // Error handling
  console.log('\nError Handling:');
  await test(
    'Invalid login returns generic error',
    'POST',
    '/auth/login',
    { email: 'nonexistent@example.com', password: 'wrong' },
    401
  );

  // Summary
  console.log('\n========================================');
  console.log(`Tests Run: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('========================================\n');

  if (testsFailed === 0) {
    console.log('All tests passed! ✓');
    process.exit(0);
  } else {
    console.log(`${testsFailed} test(s) failed!`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
