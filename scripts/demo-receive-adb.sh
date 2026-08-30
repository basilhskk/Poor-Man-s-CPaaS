#!/bin/sh
# Demo: inject an inbound SMS into a running Android emulator via ADB,
# then poll the server inbox until the gateway app syncs it.
#
# Requires: adb in PATH, emulator running, gateway app started.
# Usage: ./scripts/demo-receive-adb.sh [from] [body]
#
# Env overrides:
#   SERVER_URL=http://localhost:3000
#   USERNAME=admin
#   PASSWORD=secret

BASE_URL="${SERVER_URL:-http://localhost:3000}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-secret}"
FROM="${1:-+30697000000}"
BODY="${2:-Hello from ADB!}"
COOKIE_JAR="$(mktemp).cookies"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

printf "${BOLD}=== Poor Man's CPaaS — Receive via ADB ===${RESET}\n\n"

# adb available?
if ! command -v adb >/dev/null 2>&1; then
  printf "${RED}✗ adb not found in PATH. Add Android SDK platform-tools to PATH.${RESET}\n"
  exit 1
fi

# Find running emulator
DEVICE=$(adb devices | awk '/emulator/{print $1}' | head -1)
if [ -z "$DEVICE" ]; then
  printf "${RED}✗ No emulator detected. Start one from Android Studio first.${RESET}\n"
  exit 1
fi

printf "${CYAN}Emulator: ${BOLD}%s${RESET}\n" "$DEVICE"
printf "${CYAN}→ Injecting SMS from ${BOLD}%s${RESET}${CYAN}: \"%s\"${RESET}\n\n" "$FROM" "$BODY"
adb -s "$DEVICE" emu sms send "$FROM" "$BODY"
printf "${GREEN}✓ SMS injected into emulator${RESET}\n\n"

# Login
printf "${CYAN}→ Logging in as ${BOLD}%s${RESET}${CYAN}...${RESET}\n" "$USERNAME"
curl -sf -c "$COOKIE_JAR" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" >/dev/null || {
  printf "${RED}✗ Login failed — is server running at %s?${RESET}\n" "$BASE_URL"
  exit 1
}
printf "${GREEN}✓ Logged in${RESET}\n\n"

printf "${CYAN}Polling server inbox (app syncs on next poll cycle)...${RESET}\n"

ATTEMPTS=0
MAX=20
while [ "$ATTEMPTS" -lt "$MAX" ]; do
  INBOX=$(curl -sf -b "$COOKIE_JAR" "$BASE_URL/api/sms/inbox?pageSize=10" 2>/dev/null)

  if printf '%s' "$INBOX" | grep -qF "$BODY"; then
    printf "\n${GREEN}✓ Message synced to server!${RESET}\n\n"
    printf '%s\n' "$INBOX"
    exit 0
  fi

  ATTEMPTS=$((ATTEMPTS + 1))
  printf "${YELLOW}  … waiting for app to sync (%d/%d)${RESET}\n" "$ATTEMPTS" "$MAX"
  sleep 3
done

printf "\n${RED}✗ Timeout — app did not sync within %ds.${RESET}\n" "$((MAX * 3))"
printf "Check: gateway service started? correct server URL + API key in app settings?\n"
exit 1
