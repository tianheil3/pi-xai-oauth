#!/usr/bin/env bash
set -euo pipefail

AUTH_FILE="${HOME}/.pi/agent/auth.json"
URL="https://api.x.ai/v1/images/generations"
MODEL="grok-imagine-image-quality"
PROMPT="A minimal blue circle on a white background, flat vector icon"

if [[ ! -f "${AUTH_FILE}" ]]; then
  echo "Missing ${AUTH_FILE}. Run: pi /login xai-auth" >&2
  exit 1
fi

TOKEN="$(node -e "const auth=require('${AUTH_FILE//\'/\\\'}'); console.log(auth['xai-auth']?.access || '')")"
if [[ -z "${TOKEN}" ]]; then
  echo "No xai-auth access token in ${AUTH_FILE}" >&2
  exit 1
fi

post_json() {
  local label="$1"
  local payload="$2"
  local expect_code="$3"
  echo "${label}"
  local response=""
  local attempt
  for attempt in 1 2 3 4 5; do
    set +e
    response="$(curl -4 -sS --connect-timeout 30 --max-time 180 \
      -w $'\n__HTTP__%{http_code}' \
      -X POST "${URL}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "${payload}" 2>&1)"
    local curl_status=$?
    set -e
    if [[ "${curl_status}" -eq 0 && "${response}" == *$'\n__HTTP__'* ]]; then
      break
    fi
    if [[ "${attempt}" -eq 5 ]]; then
      echo "  curl failed after 5 attempts: ${response}" >&2
      exit 1
    fi
    echo "  retrying (${attempt}/5)..."
    sleep 3
  done
  local body="${response%%$'\n__HTTP__'*}"
  local code="${response##*$'\n__HTTP__'}"
  echo "  HTTP ${code}"
  if [[ "${code}" != "${expect_code}" ]]; then
    echo "  Body: ${body}" >&2
    exit 1
  fi
  if [[ "${expect_code}" == "200" ]]; then
    node -e "const body=JSON.parse(process.argv[1]); if(!(body.data||[]).some(x=>x.url)) process.exit(1)" "${body}"
    echo "  OK (image URL returned)"
  else
    echo "  OK (expected failure)"
  fi
}

post_json "1) Deprecated payload with size (expect 400)" \
  "{\"model\":\"${MODEL}\",\"prompt\":\"${PROMPT}\",\"n\":1,\"size\":\"1024x1024\"}" \
  "400"

post_json "2) New minimal payload (expect 200)" \
  "{\"model\":\"${MODEL}\",\"prompt\":\"${PROMPT}\",\"n\":1}" \
  "200"

post_json "3) aspect_ratio + resolution (expect 200)" \
  "{\"model\":\"${MODEL}\",\"prompt\":\"${PROMPT}\",\"n\":1,\"aspect_ratio\":\"16:9\",\"resolution\":\"1k\"}" \
  "200"

post_json "4) Legacy size mapped to aspect_ratio (expect 200)" \
  "{\"model\":\"${MODEL}\",\"prompt\":\"${PROMPT}\",\"n\":1,\"aspect_ratio\":\"1:1\"}" \
  "200"

echo
echo "Live image generation test: all checks passed."