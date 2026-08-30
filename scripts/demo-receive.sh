#!/bin/sh
# Demo: simulate the Android device posting an inbound SMS to the server.
# Usage: ./scripts/demo-receive.sh [from] [body]
#
# Env overrides:
#   SERVER_URL=http://localhost:3000
#   DEVICE_API_KEY=<key from device registration>
#   USERNAME=admin
#   PASSWORD=secret

BASE_URL="${SERVER_URL:-http://localhost:3000}"
DEVICE_KEY="${DEVICE_API_KEY:-}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-secret}"
FROM="${1:-+30697000000}"
BODY="${2:-STOP}"
RECEIVED_AT="$(date +%s)000"
COOKIE_JAR="$(mktemp).cookies"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

printf "${BOLD}=== Poor Man's CPaaS — Receive Demo ===${RESET}\n\n"

if [ -z "$DEVICE_KEY" ]; then
  printf "${RED}✗ DEVICE_API_KEY not set. Copy the key shown when registering a device in the UI.${RESET}\n"
  exit 1
fi

# Simulate device posting inbound SMS
printf "${CYAN}→ Simulating inbound SMS from ${BOLD}%s${RESET}${CYAN}: \"%s\"${RESET}\n\n" "$FROM" "$BODY"
RESPONSE=$(curl -sf -X POST "$BASE_URL/device/sms/received" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $DEVICE_KEY" \
  -d "[{\"from\":\"$FROM\",\"body\":\"$BODY\",\"receivedAt\":$RECEIVED_AT}]") || {
  printf "${RED}✗ Could not reach server at %s${RESET}\n" "$BASE_URL"
  exit 1
}
printf "${GREEN}✓ Stored${RESET}  %s\n\n" "$RESPONSE"

# Login to fetch inbox
printf "${CYAN}→ Logging in as ${BOLD}%s${RESET}${CYAN} to verify inbox...${RESET}\n" "$USERNAME"
curl -sf -c "$COOKIE_JAR" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" >/dev/null || {
  printf "${RED}✗ Login failed${RESET}\n"
  exit 1
}

printf "${CYAN}Inbox (latest 5):${RESET}\n"
curl -sf -b "$COOKIE_JAR" "$BASE_URL/api/sms/inbox?pageSize=5" || {
  printf "${RED}✗ Could not fetch inbox${RESET}\n"
  exit 1
}
printf "\n"
