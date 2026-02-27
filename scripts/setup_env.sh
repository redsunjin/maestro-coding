#!/usr/bin/env bash
# scripts/setup_env.sh
# Maestro Coding — 환경변수(.env) 대화형 설정 스크립트 (Bash)
#
# 사용법:
#   sh scripts/setup_env.sh
#   또는
#   npm run setup

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

echo ""
echo "🎼 Maestro Coding — 환경 설정 스크립트"
echo "======================================="

if [ -f "$ENV_FILE" ]; then
  echo ""
  read -r -p ".env 파일이 이미 존재합니다. 덮어쓰시겠습니까? [y/N] " OVERWRITE
  case "$OVERWRITE" in
    [yY][eE][sS]|[yY]) ;;
    *) echo "취소되었습니다. 기존 .env 파일을 유지합니다."; exit 0 ;;
  esac
fi

echo ""
read -r -p "MAIN_REPO_PATH (git merge를 실행할 레포 경로) [기본: 현재 디렉토리]: " MAIN_REPO_PATH
MAIN_REPO_PATH="${MAIN_REPO_PATH:-$(pwd)}"

read -r -p "PORT (서버 포트) [기본: 8080]: " PORT
PORT="${PORT:-8080}"

read -r -p "MAESTRO_SERVER_TOKEN (인증 토큰, 빈 값으로 두면 인증 없음): " MAESTRO_SERVER_TOKEN

read -r -p "VITE_WS_URL (WebSocket 주소) [기본: ws://localhost:${PORT}]: " VITE_WS_URL
VITE_WS_URL="${VITE_WS_URL:-ws://localhost:${PORT}}"

cat > "$ENV_FILE" << ENVEOF
# Maestro Coding — 환경변수 (자동 생성)
# ⚠️ 이 파일은 절대 Git에 커밋하지 마세요!

MAIN_REPO_PATH=${MAIN_REPO_PATH}
PORT=${PORT}
MAESTRO_SERVER_TOKEN=${MAESTRO_SERVER_TOKEN}
VITE_WS_URL=${VITE_WS_URL}
ENVEOF

echo ""
echo "✅ .env 파일이 생성되었습니다: $ENV_FILE"
echo ""
echo "서버를 시작하려면:"
echo "  npm run server"
