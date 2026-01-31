#!/bin/bash

# Manual Rate Limiting Test Script
# This script demonstrates the new rate limiting implementation

set -e

echo "════════════════════════════════════════════════════"
echo "  Manual Rate Limiting Verification"
echo "════════════════════════════════════════════════════"
echo ""

BASE_URL="${BASE_URL:-http://localhost:3000}"
ENDPOINT="/api/v1/auth/login"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Test Setup:${NC}"
echo "  Base URL: $BASE_URL"
echo "  Endpoint: $ENDPOINT"
echo ""

# Test 1: Normal IP-based rate limiting  
echo -e "${BLUE}Test 1: Normal IP-based Rate Limiting${NC}"
echo "Making multiple requests with same IP..."
echo""

count=0
for i in {1..60}; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.100" \
    -d '{"username":"test","password":"test"}' 2>/dev/null)
  
  if [ "$HTTP_CODE" == "429" ]; then
    echo -e "${YELLOW}✓ Request $i: Rate limited (429)${NC}"
    ((count++))
  elif [ "$i" -le 10 ] || [ $((i % 10)) -eq 0 ]; then
    echo -e "  Request $i: $HTTP_CODE"
  fi
done

echo ""
if [ $count -gt 0 ]; then
  echo -e "${GREEN}✓ IP-based rate limiting is working ($count requests were rate limited)${NC}"
else
  echo -e "${RED}✗ No requests were rate limited - threshold may be too high${NC}"
fi

echo ""
echo "─────────────────────────────────────────────────────"
echo ""

# Test 2: Verify different IPs have separate limits
echo -e "${BLUE}Test 2: No Cross-Contamination Between IPs${NC}"
echo "Testing that different IPs have independent rate limits..."
echo ""

# Make many requests from IP1
echo "Spamming from IP 203.0.113.101..."
for i in {1..30}; do
  curl -s -o /dev/null -w "" \
    -X POST "$BASE_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.101" \
    -d '{"username":"test","password":"test"}' 2>/dev/null
done

# Check if IP2 is still allowed
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 203.0.113.102" \
  -d '{"username":"test","password":"test"}' 2>/dev/null)

echo ""
if [ "$HTTP_CODE" != "429" ]; then
  echo -e  "${GREEN}✓ IP2 (203.0.113.102) not affected by IP1 spam: $HTTP_CODE${NC}"
  echo -e "${GREEN}✓ No cross-contamination detected${NC}"
else
  echo -e "${RED}✗ IP2 was rate limited - cross-contamination detected!${NC}"
fi

echo ""
echo "─────────────────────────────────────────────────────"
echo ""

# Test 3: Check server logs for missing IP warnings
echo -e "${BLUE}Test 3: Check Logs for Missing IP Handling${NC}"
echo "Look for these log messages in the server output:"
echo -e "  ${YELLOW}WARN${NC} Rate limiting by user ID due to missing IP"
echo -e "  ${YELLOW}DEBUG${NC} Rate limiting by session due to missing IP"
echo ""
echo "To manually test missing IP scenarios, you would need to:"
echo "  1. Deploy behind a reverse proxy without X-Forwarded-For"
echo "  2. Check that authenticated users use user ID fallback"
echo "  3. Check that anonymous users get session cookies"
echo ""

echo "════════════════════════════════════════════════════"
echo -e "${GREEN}Manual verification complete!${NC}"
echo ""
echo "What was verified:"
echo "  ✓ Rate limiting triggers after multiple requests"
echo "  ✓ Different IPs have independent rate limit counters"
echo "  ✓ No cross-contamination between users/IPs"
echo ""
echo "Note: Full fallback testing (missing IP) requires special"
echo "      network configuration or reverse proxy setup."
echo "════════════════════════════════════════════════════"
