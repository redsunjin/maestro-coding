#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[QA] Running regression tests"
npm test

echo "[QA] Running production build check"
npm run build

echo "[QA] PASS - regression and build checks completed"
