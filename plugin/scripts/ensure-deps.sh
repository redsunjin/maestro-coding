#!/bin/sh
# ensure-deps.sh — 설치된 플러그인 사본에 서버 런타임 의존성(ws, bonjour-service)을 보장한다.
# 어떤 경우에도 exit 0 (SessionStart 훅이 세션을 차단하면 안 됨). 이미 설치돼 있으면 무출력 즉시 종료.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0

if [ -d node_modules/ws ]; then
  exit 0
fi

if npm install --no-save --no-audit --no-fund --omit=dev --ignore-scripts ws bonjour-service >/dev/null 2>&1; then
  echo "maestro: 서버 의존성 설치 완료 (ws, bonjour-service)"
else
  echo "maestro: 서버 의존성 자동 설치 실패 — 플러그인 폴더에서 'npm install ws bonjour-service'를 실행하세요."
fi
exit 0
