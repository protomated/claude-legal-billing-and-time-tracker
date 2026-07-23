#!/usr/bin/env bash
#
# Trigger a Dokploy application deployment and fail loudly on any error.
#
# Dokploy's POST /api/application.deploy can return HTTP 200 with an error
# *body* (e.g. {"error":"Deployment not found"}) when the applicationId is
# stale or the app/deployment is missing. Checking only the HTTP status lets
# those failures go green while prod silently keeps serving the old image.
# This script also inspects the body.
#
# Two trigger modes:
#   1. Webhook  — set DOKPLOY_WEBHOOK_URL to the app's deploy webhook. Preferred:
#                 the app identity is in the URL, so it can't hit the false-200
#                 "Deployment not found" that the api-key path returns on some
#                 Dokploy versions.
#   2. API key  — set DOKPLOY_URL + DOKPLOY_API_KEY + DOKPLOY_APP_ID.
# Webhook takes precedence when both are present.
#
# Env:
#   DOKPLOY_WEBHOOK_URL  Deploy webhook (mode 1)
#   DOKPLOY_URL          Base URL of the Dokploy instance (mode 2)
#   DOKPLOY_API_KEY      API key, x-api-key header (mode 2)
#   DOKPLOY_APP_ID       applicationId to deploy (mode 2)
set -euo pipefail

fail() {
  echo "::error::Deployment failed: $1"
  exit 1
}

if [ -n "${DOKPLOY_WEBHOOK_URL:-}" ]; then
  echo "Deploying via webhook"
  response=$(curl -s -w "\n%{http_code}" -X POST "${DOKPLOY_WEBHOOK_URL}")
else
  : "${DOKPLOY_URL:?DOKPLOY_URL is not set}"
  : "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY is not set}"
  # A blank applicationId is the most common cause of "Deployment not found":
  # a missing/renamed Dokploy app leaves the GitHub secret empty or stale.
  if [ -z "${DOKPLOY_APP_ID:-}" ]; then
    fail "DOKPLOY_APP_ID is empty — check the Dokploy app-id secret"
  fi
  echo "Deploying via application.deploy"
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${DOKPLOY_URL}/api/application.deploy" \
    -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"applicationId\": \"${DOKPLOY_APP_ID}\"}")
fi

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "Status: ${http_code}"
echo "Response: ${body}"

# 1. Hard HTTP failure.
if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  fail "HTTP ${http_code} from Dokploy"
fi

# 2. False-200: Dokploy returned 2xx but the body signals an error. Match the
#    documented failure shapes case-insensitively: an "error" field, a nested
#    4xx/5xx statusCode, or a "not found" message.
lower_body=$(printf '%s' "$body" | tr '[:upper:]' '[:lower:]')
case "$lower_body" in
  *'"error"'* | *'not found'* | *'"statuscode":4'* | *'"statuscode":5'* | *'"success":false'*)
    fail "Dokploy returned 2xx but the body indicates an error (likely a stale applicationId)"
    ;;
esac

echo "Deployment triggered successfully"
