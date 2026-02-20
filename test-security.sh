#!/bin/bash

echo "=========================================="
echo "PharmaStock - Security Validation Tests"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:5000/api"
EMAIL="test@example.com"
PASSWORD="TestPassword123!"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
test_case() {
  local name=$1
  local expected_status=$2
  local method=$3
  local endpoint=$4
  local data=$5
  
  echo -n "Testing: $name... "
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $status)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}FAIL${NC} (Expected $expected_status, got $status)"
    echo "  Response: $body"
    ((TESTS_FAILED++))
  fi
}

# 1. Health check
echo -e "\n${YELLOW}=== Basic Connectivity ===${NC}"
test_case "Health check" 200 "GET" "/health"

# 2. Invalid email format
echo -e "\n${YELLOW}=== Input Validation ===${NC}"
test_case "Invalid email format" 400 "POST" "/auth/login" \
  "{\"email\":\"invalid-email\",\"password\":\"password123\"}"

test_case "Missing required fields" 400 "POST" "/auth/login" \
  "{\"email\":\"test@example.com\"}"

# 3. SQL injection attempts
echo -e "\n${YELLOW}=== SQL Injection Protection ===${NC}"
test_case "SQL injection in email" 400 "POST" "/auth/login" \
  "{\"email\":\"' OR '1'='1\",\"password\":\"password\"}"

# 4. CORS headers
echo -e "\n${YELLOW}=== CORS Headers ===${NC}"
echo -n "Checking CORS headers... "
cors_header=$(curl -s -i -X GET "$API_URL/health" | grep -i "access-control-allow-origin")
if [ -n "$cors_header" ]; then
  echo -e "${GREEN}PASS${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}FAIL${NC}"
  ((TESTS_FAILED++))
fi

# 5. Security headers
echo -e "\n${YELLOW}=== Security Headers ===${NC}"
echo -n "Checking X-Frame-Options... "
frame_header=$(curl -s -i -X GET "$API_URL/health" | grep -i "x-frame-options")
if [ -n "$frame_header" ]; then
  echo -e "${GREEN}PASS${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}FAIL${NC}"
  ((TESTS_FAILED++))
fi

echo -n "Checking X-Content-Type-Options... "
content_header=$(curl -s -i -X GET "$API_URL/health" | grep -i "x-content-type-options")
if [ -n "$content_header" ]; then
  echo -e "${GREEN}PASS${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}FAIL${NC}"
  ((TESTS_FAILED++))
fi

# 6. Rate limiting
echo -e "\n${YELLOW}=== Rate Limiting ===${NC}"
echo "Sending 6 rapid requests..."
for i in {1..6}; do
  response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test@example.com\",\"password\":\"wrong\"}")
  status=$(echo "$response" | tail -n1)
  
  if [ $i -eq 6 ]; then
    if [ "$status" = "429" ]; then
      echo -e "Request $i: ${GREEN}Rate limited (429)${NC}"
      ((TESTS_PASSED++))
    else
      echo -e "Request $i: ${RED}Not rate limited (got $status)${NC}"
      ((TESTS_FAILED++))
    fi
  else
    echo "Request $i: HTTP $status"
  fi
done

# 7. Login flow
echo -e "\n${YELLOW}=== Authentication Flow ===${NC}"
test_case "Invalid credentials" 401 "POST" "/auth/login" \
  "{\"email\":\"$EMAIL\",\"password\":\"wrongpassword\"}"

# Summary
echo ""
echo "=========================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "=========================================="

if [ $TESTS_FAILED -eq 0 ]; then
  exit 0
else
  exit 1
fi
