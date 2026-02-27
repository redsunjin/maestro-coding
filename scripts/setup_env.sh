#!/usr/bin/env bash
# scripts/setup_env.sh — .env 파일 초기 설정 스크립트 (Linux/macOS)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo ".env 파일이 이미 존재합니다: $ENV_FILE"
  read -r -p "덮어쓰시겠습니까? (y/N) " answer
  case "$answer" in
    [yY]) ;;
    *) echo "취소되었습니다."; exit 0 ;;
  esac
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"
echo ".env 파일이 생성되었습니다: $ENV_FILE"
echo ""
echo "다음 항목을 편집하여 실제 값을 입력하세요:"
echo "  MAIN_REPO_PATH — git merge를 수행할 로컬 레포지토리 경로"
echo "  MAESTRO_SERVER_TOKEN — API 인증 토큰 (선택)"
echo ""
echo "편집 예시:"
echo "  nano $ENV_FILE"
echo "  또는: code $ENV_FILE"
