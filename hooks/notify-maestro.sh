#!/bin/sh
# notify-maestro.sh — AI 에이전트 작업 완료 시 Maestro 서버에 승인 요청을 보내는 훅 스크립트
#
# 사용법:
#   ./hooks/notify-maestro.sh [브랜치명] [작업제목] [변경요약]
#
# 모든 인자는 선택 사항입니다. 생략하면 현재 git 상태에서 자동으로 읽어옵니다.
#
# 예시:
#   ./hooks/notify-maestro.sh feature/auth "JWT 검증 로직 추가" "auth.js 45-60 수정"
#   ./hooks/notify-maestro.sh   # 인자 없이 실행 시 git 브랜치/커밋 메시지 자동 감지
#
# 환경변수:
#   MAESTRO_URL   서버 주소 (기본값: http://localhost:8080)
#   AGENT_ID      에이전트 식별자 (기본값: terminal_agent)
#   LANE_INDEX    UI 레인 번호 1~4 (기본값: 서버가 랜덤 배정)
#   MAESTRO_SERVER_TOKEN  서버 인증 토큰 (설정 시 Authorization 헤더 자동 추가)

MAESTRO_URL="${MAESTRO_URL:-http://localhost:8080}"
AGENT_ID="${AGENT_ID:-terminal_agent}"
MAESTRO_SERVER_TOKEN="${MAESTRO_SERVER_TOKEN:-}"

# ── 인자 또는 git 상태에서 정보 수집 ─────────────────────────────────────────

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')}"
TITLE="${2:-$(git log -1 --pretty=format:'%s' 2>/dev/null || echo '에이전트 작업 완료')}"
DESCRIPTION="${3:-$(git log -1 --pretty=format:'%b' 2>/dev/null | head -1)}"

# ── JSON 문자열 이스케이프 (쌍따옴표·백슬래시 처리) ──────────────────────────

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

ESC_AGENT=$(json_escape "$AGENT_ID")
ESC_BRANCH=$(json_escape "$BRANCH")
ESC_TITLE=$(json_escape "$TITLE")
ESC_DESC=$(json_escape "$DESCRIPTION")

# ── Maestro 서버로 승인 요청 POST ─────────────────────────────────────────────

# laneIndex 는 선택 사항 — 있을 때만 페이로드에 포함
LANE_FIELD=""
if [ -n "$LANE_INDEX" ]; then
  LANE_FIELD=",\"laneIndex\":${LANE_INDEX}"
fi

PAYLOAD="{\"agentId\":\"${ESC_AGENT}\",\"branchName\":\"${ESC_BRANCH}\"${LANE_FIELD},\"diffSummary\":{\"title\":\"${ESC_TITLE}\",\"impact\":\"Medium\",\"shortDescription\":\"${ESC_DESC}\"}}"

if [ -n "$MAESTRO_SERVER_TOKEN" ]; then
  RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "${MAESTRO_URL}/api/request" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${MAESTRO_SERVER_TOKEN}" \
    -d "$PAYLOAD")
else
  RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "${MAESTRO_URL}/api/request" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
fi

HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Maestro 승인 요청 전송 완료 (branch: ${BRANCH})"
  echo "   응답: ${BODY}"
elif [ "$HTTP_STATUS" = "401" ]; then
  echo "⛔ 인증 실패: MAESTRO_SERVER_TOKEN 값을 확인하세요."
  echo "   응답: ${BODY}"
else
  echo "⚠️  Maestro 서버에 연결할 수 없습니다 (${MAESTRO_URL})"
  echo "   maestro-server.js 가 실행 중인지 확인하세요: npm run server"
fi
