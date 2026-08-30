#!/bin/sh
# Demo: queue an outbound SMS and poll until terminal status.
# Usage: ./scripts/demo-send.sh [to] [body]
#
# Env overrides:
#   SERVER_URL=http://localhost:3000
#   USERNAME=admin
#   PASSWORD=secret

BASE_URL="${SERVER_URL:-http://localhost:3000}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-secret}"
TO="${1:-+30210000000}"
BODY="${2:-Hello from Poor Man's CPaaS!}"
COOKIE_JAR="$(mktemp).cookies"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

printf "${BOLD}=== Poor Man's CPaaS — Send Demo ===${RESET}\n\n"

# Login
printf "${CYAN}→ Logging in as ${BOLD}%s${RESET}\n" "$USERNAME"
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}") || {
  printf "${RED}✗ Login failed — is server running at %s?${RESET}\n" "$BASE_URL"
  exit 1
}
printf "${GREEN}✓ Logged in${RESET}\n\n"

# Queue
printf "${CYAN}→ Queuing SMS to ${BOLD}%s${RESET}${CYAN}: \"%s\"${RESET}\n" "$TO" "$BODY"
RESPONSE=$(curl -sf -b "$COOKIE_JAR" -X POST "$BASE_URL/api/sms/send" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"$TO\",\"body\":\"$BODY\"}") || {
  printf "${RED}✗ Send failed${RESET}\n"
  exit 1
}
printf "${GREEN}✓ Queued${RESET}  %s\n\n" "$RESPONSE"

ID=$(printf '%s' "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$ID" ]; then
  printf "${RED}✗ Could not parse message id${RESET}\n"
  exit 1
fi

printf "${CYAN}Polling status for id: ${BOLD}%s${RESET}\n" "$ID"

while true; do
  STATUS_JSON=$(curl -sf -b "$COOKIE_JAR" "$BASE_URL/api/sms/$ID") || {
    printf "${YELLOW}  … server unreachable, retrying${RESET}\n"
    sleep 2
    continue
  }
  CURRENT=$(printf '%s' "$STATUS_JSON" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  printf "  status: ${BOLD}%s${RESET}\n" "$CURRENT"

  case "$CURRENT" in
    sent)
      printf "\n${GREEN}✓ Delivered — SMS accepted by radio${RESET}\n"
      break
      ;;
    dead_letter|failed)
      REASON=$(printf '%s' "$STATUS_JSON" | grep -o '"failureReason":"[^"]*"' | cut -d'"' -f4)
      printf "\n${RED}✗ Dead-lettered — reason: %s${RESET}\n" "${REASON:-unknown}"
      break
      ;;
  esac
  sleep 3
done
