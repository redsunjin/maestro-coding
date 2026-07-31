#!/bin/sh
# ensure-deps.sh — 설치된 플러그인 사본에 서버 런타임 의존성(ws, bonjour-service)을 보장한다.
# 어떤 경우에도 exit 0 (SessionStart 훅이 세션을 차단하면 안 됨). 이미 설치돼 있으면 무출력 즉시 종료.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0

if [ -d node_modules/ws ]; then
  exit 0
fi

# 프로덕션 의존성 전체 설치 (ws 포함 — devDependencies 제외).
# 주의: npm exit 0이 곧 성공이 아님(--omit 규칙 등) — 결과물 존재로 성공을 판정한다.
npm install --no-save --no-audit --no-fund --omit=dev --ignore-scripts >/dev/null 2>&1

if [ -d node_modules/ws ]; then
  echo "maestro: 서버 의존성 설치 완료"
else
  echo "maestro: 서버 의존성 자동 설치 실패 — 플러그인 폴더($ROOT)에서 'npm install --omit=dev'를 실행하세요."
fi
exit 0
