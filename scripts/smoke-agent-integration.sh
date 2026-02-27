#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${MAESTRO_SMOKE_PORT:-18083}"
TOKEN="${MAESTRO_SMOKE_TOKEN:-secret-token}"
EXPECTED_BRANCH="feature/integration"

TMP_REPO="$(mktemp -d /tmp/maestro-int-repo-XXXXXX)"
WS_CHECK_SCRIPT="$(mktemp /tmp/maestro-ws-check-XXXXXX.cjs)"
SERVER_LOG="$(mktemp /tmp/maestro-smoke-server-XXXXXX.log)"
WS_LOG="$(mktemp /tmp/maestro-smoke-ws-XXXXXX.log)"
HOOK_NO_TOKEN_LOG="$(mktemp /tmp/maestro-smoke-hook-no-token-XXXXXX.log)"
HOOK_WITH_TOKEN_LOG="$(mktemp /tmp/maestro-smoke-hook-with-token-XXXXXX.log)"
SERVER_PID=""
WS_PID=""
SCRIPT_STATUS=1

cleanup() {
  if [ -n "${WS_PID}" ]; then
    kill "${WS_PID}" >/dev/null 2>&1 || true
    wait "${WS_PID}" 2>/dev/null || true
  fi
  if [ -n "${SERVER_PID}" ]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f "${WS_CHECK_SCRIPT}"
  rm -rf "${TMP_REPO}"

  if [ "${SCRIPT_STATUS}" -ne 0 ]; then
    echo "[SMOKE] FAILED"
    echo "  server log: ${SERVER_LOG}"
    echo "  ws log: ${WS_LOG}"
    echo "  hook(no token) log: ${HOOK_NO_TOKEN_LOG}"
    echo "  hook(with token) log: ${HOOK_WITH_TOKEN_LOG}"
  else
    rm -f "${SERVER_LOG}" "${WS_LOG}" "${HOOK_NO_TOKEN_LOG}" "${HOOK_WITH_TOKEN_LOG}"
  fi
}
trap cleanup EXIT

cat > "${WS_CHECK_SCRIPT}" <<'NODE'
const wsUrl = process.env.WS_URL;
const expectedBranch = process.env.EXPECTED_BRANCH || 'feature/integration';

if (!wsUrl) {
  console.error('missing WS_URL');
  process.exit(10);
}

if (typeof WebSocket === 'undefined') {
  console.error('no global WebSocket in this Node runtime');
  process.exit(12);
}

let requestId = null;
let merged = false;
let undone = false;
let rejected = false;
const rejectRequestId = 'req_reject_manual';

const timeoutId = setTimeout(() => {
  console.error('timeout waiting for approve/undo/reject flow');
  process.exit(3);
}, 20000);

const ws = new WebSocket(wsUrl);

ws.addEventListener('message', (event) => {
  let msg;
  try {
    msg = JSON.parse(String(event.data));
  } catch {
    return;
  }

  if (msg.event === 'AGENT_TASK_READY' && !requestId) {
    requestId = msg.requestId;
    ws.send(JSON.stringify({
      action: 'APPROVE',
      requestId,
      branchName: expectedBranch,
      laneIndex: 1,
    }));
    return;
  }

  if (msg.event === 'MERGE_FAILED' && msg.requestId === requestId) {
    clearTimeout(timeoutId);
    process.exit(2);
  }

  if (msg.event === 'MERGE_SUCCESS' && msg.requestId === requestId && !merged) {
    merged = true;
    ws.send(JSON.stringify({ action: 'UNDO' }));
    return;
  }

  if (msg.event === 'UNDO_FAILED') {
    clearTimeout(timeoutId);
    process.exit(4);
  }

  if (msg.event === 'UNDO_SUCCESS' && !undone) {
    undone = true;
    ws.send(JSON.stringify({
      action: 'REJECT',
      requestId: rejectRequestId,
      feedback: 'integration reject check',
    }));
    return;
  }

  if (msg.event === 'AGENT_RESTARTED' && msg.requestId === rejectRequestId && !rejected) {
    rejected = true;
    clearTimeout(timeoutId);
    ws.close();
    process.exit(0);
  }
});

ws.addEventListener('error', () => {
  clearTimeout(timeoutId);
  process.exit(11);
});
NODE

git -C "${TMP_REPO}" init -b main >/dev/null
git -C "${TMP_REPO}" config user.name "integration-bot"
git -C "${TMP_REPO}" config user.email "integration-bot@example.com"

echo "base" > "${TMP_REPO}/file.txt"
git -C "${TMP_REPO}" add file.txt
git -C "${TMP_REPO}" commit -m "base" >/dev/null
BASE_HASH="$(git -C "${TMP_REPO}" rev-parse HEAD)"

git -C "${TMP_REPO}" checkout -b "${EXPECTED_BRANCH}" >/dev/null
echo "feature change" >> "${TMP_REPO}/file.txt"
git -C "${TMP_REPO}" commit -am "feature" >/dev/null
git -C "${TMP_REPO}" checkout main >/dev/null

PORT="${PORT}" HOST=127.0.0.1 MAIN_REPO_PATH="${TMP_REPO}" MAESTRO_SERVER_TOKEN="${TOKEN}" node "${ROOT_DIR}/maestro-server.js" > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

HEALTHY=0
for _ in {1..50}; do
  CODE="$(curl -s -o /tmp/maestro-smoke-health.json -w "%{http_code}" "http://127.0.0.1:${PORT}/health" || true)"
  if [ "${CODE}" = "200" ]; then
    HEALTHY=1
    break
  fi
  sleep 0.2
done

if [ "${HEALTHY}" -ne 1 ]; then
  exit 20
fi

WS_URL="ws://127.0.0.1:${PORT}" EXPECTED_BRANCH="${EXPECTED_BRANCH}" node "${WS_CHECK_SCRIPT}" > "${WS_LOG}" 2>&1 &
WS_PID=$!

MAESTRO_URL="http://127.0.0.1:${PORT}" AGENT_ID="integration_agent" LANE_INDEX=1 sh "${ROOT_DIR}/hooks/notify-maestro.sh" "${EXPECTED_BRANCH}" "Integration no token" "should fail auth" > "${HOOK_NO_TOKEN_LOG}" 2>&1 || true
sleep 0.6

MAESTRO_URL="http://127.0.0.1:${PORT}" MAESTRO_SERVER_TOKEN="${TOKEN}" AGENT_ID="integration_agent" LANE_INDEX=1 sh "${ROOT_DIR}/hooks/notify-maestro.sh" "${EXPECTED_BRANCH}" "Integration with token" "should pass auth" > "${HOOK_WITH_TOKEN_LOG}" 2>&1 || true

wait "${WS_PID}"
WS_EXIT=$?

FINAL_HASH="$(git -C "${TMP_REPO}" rev-parse HEAD)"

grep -q "Unauthorized" "${HOOK_NO_TOKEN_LOG}" || exit 30
grep -q "승인 요청 전송 완료" "${HOOK_WITH_TOKEN_LOG}" || exit 31
[ "${FINAL_HASH}" = "${BASE_HASH}" ] || exit 32
[ "${WS_EXIT}" -eq 0 ] || exit 33

SCRIPT_STATUS=0
echo "[SMOKE] PASS - token auth + approve/undo/reject integration flow"
