#!/bin/sh
# run-server-quiet.sh — 플러그인 monitor 진입점.
# maestro-server CLI를 현재 프로젝트를 대상으로 실행하되, 모니터 이벤트로는
# 핵심 라인(기동/재사용/승인 요청/실패)만 통과시켜 소음을 막는다.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
PORT="${MAESTRO_PLUGIN_PORT:-8080}"

sh "$ROOT/plugin/scripts/ensure-deps.sh"

exec_target() {
  node "$ROOT/bin/maestro-server.mjs" --port "$PORT" --repo "${CLAUDE_PROJECT_DIR:-$PWD}" 2>&1
}

exec_target | grep --line-buffered -E "Maestro 서버 실행 중|재사용합니다|승인 요청 수신|기동 실패|연결 주소|Error|error"
