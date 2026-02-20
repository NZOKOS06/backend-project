/**
 * Complete Security Verification Script
 * Run: npm run security:check
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = [];
let passed = 0;
let failed = 0;

function logCheck(name, success, details = '') {
  const icon = success ? '✓' : '✗';
  const color = success ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${color}${icon}${reset} ${name}`);
  if (details) {
    console.log(`  ${details}`);
  }
  
  if (success) {
    passed++;
  } else {
    failed++;
  }
}

console.log('========================================');
console.log('Security Verification Checklist');
console.log('========================================\n');

// 1. Environment variables
console.log('Environment Configuration:');
const envFile = fs.existsSync('.env');
logCheck('.env file exists', envFile, envFile ? 'Found' : 'Missing - create from .env.example');

if (envFile) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const hasJwtSecret = envContent.includes('JWT_SECRET=') && !envContent.includes('JWT_SECRET=your');
  logCheck('JWT_SECRET configured', hasJwtSecret);

  const hasDbUrl = envContent.includes('DATABASE_URL') && !envContent.includes('postgresql://user:password');
  logCheck('DATABASE_URL configured', hasDbUrl);
}

// 2. Dependencies
console.log('\nDependencies:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const securityDeps = ['helmet', 'express-rate-limit', 'bcryptjs', 'jsonwebtoken'];

securityDeps.forEach(dep => {
  const hasDep = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
  logCheck(`${dep} installed`, !!hasDep, hasDep ? `v${packageJson.dependencies[dep] || packageJson.devDependencies[dep]}` : 'Not found');
});

// 3. File permissions
console.log('\nFile Security:');
const secretFiles = ['.env', '.env.production'];
secretFiles.forEach(file => {
  if (fs.existsSync(file)) {
    try {
      const stats = fs.statSync(file);
      const isRestricted = (stats.mode & parseInt('077', 8)) === 0;
      logCheck(`${file} permissions secure`, isRestricted, isRestricted ? '600' : `Mode: ${(stats.mode & parseInt('777', 8)).toString(8)}`);
    } catch (e) {
      logCheck(`${file} readable`, false, e.message);
    }
  }
});

// 4. Code security
console.log('\nCode Security:');
const filesToCheck = [
  'routes/auth.js',
  'middleware/auth.js',
  'server.js',
];

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for bcrypt usage in auth
    if (file === 'routes/auth.js') {
      const hasBcrypt = content.includes('bcrypt.hash');
      logCheck(`${file} uses bcrypt`, hasBcrypt);

      const hasValidation = content.includes('validateEmail') || content.includes('validate');
      logCheck(`${file} has input validation`, hasValidation);
    }

    // Check for helmet in server
    if (file === 'server.js') {
      const hasHelmet = content.includes('helmet');
      logCheck(`${file} uses helmet`, hasHelmet);

      const hasRateLimit = content.includes('rateLimit');
      logCheck(`${file} has rate limiting`, hasRateLimit);

      const hasCors = content.includes('cors');
      logCheck(`${file} configures CORS`, hasCors);
    }

    // Check for auth middleware
    if (file === 'middleware/auth.js') {
      const hasTokenVerification = content.includes('jwt.verify');
      logCheck(`${file} verifies JWT`, hasTokenVerification);
    }
  }
});

// 5. Git configuration
console.log('\nGit Security:');
if (fs.existsSync('.gitignore')) {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  const ignoresEnv = gitignore.includes('.env') && !gitignore.includes('.env.example');
  logCheck('.gitignore excludes .env', ignoresEnv, ignoresEnv ? 'Found' : 'Check if .env is ignored');

  const ignoresNodeModules = gitignore.includes('node_modules');
  logCheck('.gitignore excludes node_modules', ignoresNodeModules);
} else {
  logCheck('.gitignore exists', false);
}

// 6. Database configuration
console.log('\nDatabase Security:');
const hasDb = fs.existsSync('config/database.js');
if (hasDb) {
  const dbConfig = fs.readFileSync('config/database.js', 'utf8');
  const usesPooling = dbConfig.includes('Pool') || dbConfig.includes('pool');
  logCheck('Database uses connection pooling', usesPooling);

  const usesSsl = dbConfig.includes('ssl') || dbConfig.includes('rejectUnauthorized');
  logCheck('Database SSL configured', usesSsl || !process.env.NODE_ENV?.includes('prod'));
}

// Summary
console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  console.log('⚠️  Please fix the failed checks before deploying!\n');
  process.exit(1);
} else {
  console.log('✅ All security checks passed!\n');
  process.exit(0);
}
