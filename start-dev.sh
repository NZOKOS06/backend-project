#!/bin/bash

echo "=========================================="
echo "PharmaStock Backend - Development Server"
echo "=========================================="

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "Error: .env file not found"
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Please edit .env with your configuration"
  exit 1
fi

# Validate environment
echo "Validating environment..."

# Check required variables
required_vars=("DATABASE_URL" "JWT_SECRET" "NODE_ENV")
missing_vars=()

for var in "${required_vars[@]}"; do
  if [ -z "$(grep "^$var=" .env)" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
  echo "Error: Missing required environment variables:"
  printf '%s\n' "${missing_vars[@]}"
  exit 1
fi

# Check Node version
node_version=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$node_version" -lt 16 ]; then
  echo "Error: Node.js 16+ required (you have $(node -v))"
  exit 1
fi

# Check dependencies
echo "Checking dependencies..."
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run database initialization if needed
if [ ! -f ".db-initialized" ]; then
  echo "Initializing database..."
  npm run init-db
  touch .db-initialized
fi

# Set environment if not set
export NODE_ENV=${NODE_ENV:-development}

echo "Starting backend server..."
echo "Environment: $NODE_ENV"
echo "Port: ${PORT:-5000}"
echo ""

# Start server with security headers
npm run dev
