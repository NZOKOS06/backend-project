/**
 * Validate that no secrets are leaked in code
 * Run: node scripts/check-secrets.js
 */

const fs = require('fs');
const path = require('path');

const PATTERNS = [
  /password\s*[:=]\s*['"']?[^'"'\s]+/gi,
  /api[_-]?key\s*[:=]\s*['"']?[^'"'\s]+/gi,
  /token\s*[:=]\s*['"']?[^'"'\s]+/gi,
  /secret\s*[:=]\s*['"']?[^'"'\s]+/gi,
  /jwt\s*[:=]\s*['"']?[^'"'\s]+/gi,
];

const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.env',
  '.env.example',
  '.env.production.example',
  'SECURITY_IMPROVEMENTS.js',
  'test',
  '__tests__',
];

const EXCLUDED_FILES = [
  '.env.example',
  '.env.production.example',
  'SECURITY_IMPLEMENTATION_GUIDE.md',
  'PRODUCTION_CHECKLIST.md',
  '.gitignore',
];

function isExcluded(filePath) {
  return EXCLUDED_FILES.some(f => filePath.includes(f)) ||
    EXCLUDED_DIRS.some(dir => filePath.includes(`/${dir}/`));
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let found = false;

    PATTERNS.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        console.warn(`⚠️  Potential secret in ${filePath}:`);
        matches.forEach(match => {
          console.warn(`   ${match}`);
        });
        found = true;
      }
    });

    return found;
  } catch (error) {
    // Ignore read errors (binary files, etc)
  }
}

function scanDirectory(dir, foundSecrets = false) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const relativePath = path.relative('.', filePath);

    if (isExcluded(relativePath)) {
      return;
    }

    if (fs.statSync(filePath).isDirectory()) {
      foundSecrets = scanDirectory(filePath, foundSecrets) || foundSecrets;
    } else if (['.js', '.ts', '.json', '.jsx', '.tsx'].some(ext => file.endsWith(ext))) {
      foundSecrets = scanFile(filePath) || foundSecrets;
    }
  });

  return foundSecrets;
}

console.log('🔐 Scanning for leaked secrets...\n');

const foundSecrets = scanDirectory('.');

if (foundSecrets) {
  console.log('\n❌ Potential secrets found! DO NOT commit!');
  process.exit(1);
} else {
  console.log('✅ No obvious secrets found. Good job!');
  process.exit(0);
}
