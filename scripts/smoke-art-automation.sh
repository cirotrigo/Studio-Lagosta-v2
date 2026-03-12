#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://studio-lagosta-v2.vercel.app}"
PROJECT_ID="${PROJECT_ID:-}"
COOKIE="${COOKIE:-${AUTH_COOKIE:-}}"
SESSION_TOKEN="${SESSION_TOKEN:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Usage: PROJECT_ID=<id> [BASE_URL=<url>] [COOKIE=...] [SESSION_TOKEN=...] bash scripts/smoke-art-automation.sh"
  exit 1
fi

function request_json() {
  local method="$1"
  local endpoint="$2"
  local payload="$3"
  local use_auth="$4"

  local -a headers=("-H" "Content-Type: application/json")
  if [[ "${use_auth}" == "yes" ]]; then
    if [[ -n "${COOKIE}" ]]; then
      headers+=("-H" "Cookie: ${COOKIE}")
    fi
    if [[ -n "${SESSION_TOKEN}" ]]; then
      headers+=("-H" "Authorization: Bearer ${SESSION_TOKEN}")
    fi
  fi

  curl -sS -X "${method}" "${BASE_URL}${endpoint}" "${headers[@]}" -d "${payload}" -w $'\n__STATUS__:%{http_code}'
}

function split_response() {
  local response="$1"
  BODY="${response%$'\n'__STATUS__:*}"
  STATUS="${response##*$'\n'__STATUS__:}"
}

function print_ok() {
  local label="$1"
  local details="$2"
  printf "✓ %s: %s\n" "${label}" "${details}"
}

echo "== Smoke check: endpoint existence (${BASE_URL}) =="

unauth_ai="$(request_json POST "/api/tools/generate-ai-text" '{"projectId":1,"prompt":"ping","format":"STORY","variations":1,"usePhoto":false}' "no")"
split_response "${unauth_ai}"
if [[ "${STATUS}" == "404" ]]; then
  echo "✗ /api/tools/generate-ai-text returned 404"
  exit 1
fi
print_ok "/api/tools/generate-ai-text" "HTTP ${STATUS} (expected != 404)"

unauth_art="$(request_json POST "/api/tools/generate-art" '{"projectId":1,"text":"ping","format":"STORY","variations":1,"usePhoto":false}' "no")"
split_response "${unauth_art}"
if [[ "${STATUS}" == "404" ]]; then
  echo "✗ /api/tools/generate-art returned 404"
  exit 1
fi
print_ok "/api/tools/generate-art" "HTTP ${STATUS} (expected != 404)"

if [[ -z "${COOKIE}" && -z "${SESSION_TOKEN}" ]]; then
  echo ""
  echo "No auth credentials provided. Endpoint presence is OK."
  echo "To run full authenticated dry-run, set COOKIE and/or SESSION_TOKEN."
  exit 0
fi

echo ""
echo "== Authenticated dry-run checks =="

auth_ai_payload="$(cat <<EOF
{"projectId":${PROJECT_ID},"prompt":"Rodizio de massas todo sabado R\\$49,90","format":"STORY","variations":2,"dryRun":true,"templateIds":["S1","S2"],"includeLogo":true,"usePhoto":false,"compositionEnabled":false}
EOF
)"

auth_ai="$(request_json POST "/api/tools/generate-ai-text" "${auth_ai_payload}" "yes")"
split_response "${auth_ai}"
if [[ "${STATUS}" != "200" ]]; then
  echo "✗ generate-ai-text dryRun failed (HTTP ${STATUS})"
  echo "${BODY}"
  exit 1
fi

node -e '
const body = JSON.parse(process.argv[1]);
if (!body.ok || !body.dryRun) throw new Error("dryRun flags missing in generate-ai-text");
if (!Array.isArray(body.templatesResolved)) throw new Error("templatesResolved missing in generate-ai-text");
console.log("✓ generate-ai-text dryRun:", `${body.templatesResolved.length} templates resolved`);
' "${BODY}"

auth_art_payload="$(cat <<EOF
{"projectId":${PROJECT_ID},"text":"Rodizio de massas todo sabado R\\$49,90","format":"STORY","variations":2,"dryRun":true,"includeLogo":true,"usePhoto":false,"templateIds":["S1","S2"],"textProcessingMode":"faithful","strictTemplateMode":false}
EOF
)"

auth_art="$(request_json POST "/api/tools/generate-art" "${auth_art_payload}" "yes")"
split_response "${auth_art}"
if [[ "${STATUS}" != "200" ]]; then
  echo "✗ generate-art dryRun failed (HTTP ${STATUS})"
  echo "${BODY}"
  exit 1
fi

node -e '
const body = JSON.parse(process.argv[1]);
if (!body.ok || !body.dryRun || !body.templatePath) throw new Error("dryRun/templatePath flags missing in generate-art");
if (!Array.isArray(body.templatesResolved) || body.templatesResolved.length === 0) throw new Error("templatesResolved missing in generate-art");
console.log("✓ generate-art dryRun:", `${body.templatesResolved.length} templates resolved`);
' "${BODY}"

echo ""
echo "Smoke checks passed."
