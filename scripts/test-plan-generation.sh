#!/bin/bash
# =============================================================================
# Test Plan Generation Script
# =============================================================================
# This script allows you to quickly test the plan generation API endpoints
# without using the UI.
#
# Setup:
#   1. Start the app locally with DEV_AUTH_USER_ID set in .env.local
#   2. Make sure that auth user has a corresponding users row in the database
#   3. Run: ./scripts/test-plan-generation.sh
#
# Usage:
#   ./scripts/test-plan-generation.sh [command] [options]
#
# Commands:
#   stream    - Stream generate a plan (default)
#   create    - Create a plan record only (no generation)
#   status    - Check plan generation status
#   list      - List all plans for the user
#
# Options:
#   --topic "..."        - Topic for the plan (default: "Learn TypeScript")
#   --skill beginner|intermediate|advanced (default: beginner)
#   --hours N            - Weekly hours (default: 10)
#   --style reading|video|practice|mixed (default: mixed)
#   --notes "..."        - Optional notes
#   --plan-id UUID       - Plan ID (required for status command)
#
# Examples:
#   ./scripts/test-plan-generation.sh stream --topic "Learn React hooks"
#   ./scripts/test-plan-generation.sh stream --topic "Python basics" --skill beginner --hours 5
#   ./scripts/test-plan-generation.sh status --plan-id "abc-123-def"
#   ./scripts/test-plan-generation.sh list
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_HEADER="${COOKIE_HEADER:-}"

# Default values
COMMAND="stream"
TOPIC="Learn TypeScript fundamentals"
SKILL_LEVEL="beginner"
WEEKLY_HOURS=10
LEARNING_STYLE="mixed"
NOTES=""
PLAN_ID=""

read_env_value() {
  local key="$1"
  local file="$2"

  [[ -f "$file" ]] || return 0

  grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'"
}

# Surface whether the local dev server is expected to authenticate requests.
ENV_FILE="$PROJECT_ROOT/.env.local"
DEV_AUTH_USER_ID_VALUE="$(read_env_value "DEV_AUTH_USER_ID" "$ENV_FILE")"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    stream|create|status|list)
      COMMAND="$1"
      shift
      ;;
    --topic)
      TOPIC="$2"
      shift 2
      ;;
    --skill)
      SKILL_LEVEL="$2"
      shift 2
      ;;
    --hours)
      WEEKLY_HOURS="$2"
      shift 2
      ;;
    --style)
      LEARNING_STYLE="$2"
      shift 2
      ;;
    --notes)
      NOTES="$2"
      shift 2
      ;;
    --plan-id)
      PLAN_ID="$2"
      shift 2
      ;;
    --help|-h)
      head -45 "$0" | tail -43
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate auth setup
if [[ -z "$DEV_AUTH_USER_ID_VALUE" && -z "$COOKIE_HEADER" ]]; then
  echo -e "${RED}Error: no local auth mechanism configured${NC}"
  echo ""
  echo "Use one of these options before running this script:"
  echo "  1. Set DEV_AUTH_USER_ID in .env.local and restart the dev server"
  echo "  2. Export COOKIE_HEADER with your local session cookie if you need a real session"
  echo ""
  echo "Example .env.local entry:"
  echo "  DEV_AUTH_USER_ID=auth-user-id-from-your-local-database"
  exit 1
fi

# Build JSON payload
build_payload() {
  local payload="{
    \"topic\": \"$TOPIC\",
    \"skillLevel\": \"$SKILL_LEVEL\",
    \"weeklyHours\": $WEEKLY_HOURS,
    \"learningStyle\": \"$LEARNING_STYLE\""

  if [[ -n "$NOTES" ]]; then
    payload="$payload,
    \"notes\": \"$NOTES\""
  fi

  payload="$payload
  }"

  echo "$payload"
}

# Print request info
print_request_info() {
  local endpoint="$1"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}Endpoint:${NC} $endpoint"
  if [[ -n "$DEV_AUTH_USER_ID_VALUE" ]]; then
    echo -e "${GREEN}Auth:${NC} DEV_AUTH_USER_ID from .env.local"
  elif [[ -n "$COOKIE_HEADER" ]]; then
    echo -e "${GREEN}Auth:${NC} COOKIE_HEADER override"
  fi
  echo -e "${GREEN}Topic:${NC} $TOPIC"
  echo -e "${GREEN}Skill Level:${NC} $SKILL_LEVEL"
  echo -e "${GREEN}Weekly Hours:${NC} $WEEKLY_HOURS"
  echo -e "${GREEN}Learning Style:${NC} $LEARNING_STYLE"
  if [[ -n "$NOTES" ]]; then
    echo -e "${GREEN}Notes:${NC} $NOTES"
  fi
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# Execute based on command
case $COMMAND in
  stream)
    print_request_info "POST /api/v1/plans/stream"
    echo -e "${YELLOW}Streaming plan generation...${NC}"
    echo ""
    curl_args=(
      -X POST "${BASE_URL}/api/v1/plans/stream"
      -H "Content-Type: application/json"
      -d "$(build_payload)"
    )
    if [[ -n "$COOKIE_HEADER" ]]; then
      curl_args+=( -H "Cookie: ${COOKIE_HEADER}" )
    fi
    curl "${curl_args[@]}"
    echo ""
    ;;

  create)
    print_request_info "POST /api/v1/plans"
    echo -e "${YELLOW}Creating plan record...${NC}"
    echo ""
    curl_args=(
      -X POST "${BASE_URL}/api/v1/plans"
      -H "Content-Type: application/json"
      -d "$(build_payload)"
    )
    if [[ -n "$COOKIE_HEADER" ]]; then
      curl_args+=( -H "Cookie: ${COOKIE_HEADER}" )
    fi
    curl "${curl_args[@]}" | jq .
    echo ""
    ;;

  status)
    if [[ -z "$PLAN_ID" ]]; then
      echo -e "${RED}Error: --plan-id is required for status command${NC}"
      exit 1
    fi
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Endpoint:${NC} GET /api/v1/plans/${PLAN_ID}/status"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Checking plan status...${NC}"
    echo ""
    curl_args=( -X GET "${BASE_URL}/api/v1/plans/${PLAN_ID}/status" )
    if [[ -n "$COOKIE_HEADER" ]]; then
      curl_args+=( -H "Cookie: ${COOKIE_HEADER}" )
    fi
    curl "${curl_args[@]}" | jq .
    echo ""
    ;;

  list)
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Endpoint:${NC} GET /api/v1/plans"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Listing all plans...${NC}"
    echo ""
    curl_args=( -X GET "${BASE_URL}/api/v1/plans" )
    if [[ -n "$COOKIE_HEADER" ]]; then
      curl_args+=( -H "Cookie: ${COOKIE_HEADER}" )
    fi
    curl "${curl_args[@]}" | jq .
    echo ""
    ;;
esac

echo -e "${GREEN}Done!${NC}"
