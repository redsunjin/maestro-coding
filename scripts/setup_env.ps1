# scripts/setup_env.ps1
# Maestro Coding — 환경변수(.env) 대화형 설정 스크립트 (PowerShell)
#
# 사용법:
#   .\scripts\setup_env.ps1

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $rootDir ".env"

Write-Host ""
Write-Host "🎼 Maestro Coding — 환경 설정 스크립트 (PowerShell)"
Write-Host "======================================================"

if (Test-Path $envFile) {
    Write-Host ""
    $overwrite = Read-Host ".env 파일이 이미 존재합니다. 덮어쓰시겠습니까? [y/N]"
    if ($overwrite -notmatch '^[yY]') {
        Write-Host "취소되었습니다. 기존 .env 파일을 유지합니다."
        exit 0
    }
}

Write-Host ""
$mainRepoPath = Read-Host "MAIN_REPO_PATH (git merge를 실행할 레포 경로) [기본: 현재 디렉토리]"
if ([string]::IsNullOrWhiteSpace($mainRepoPath)) { $mainRepoPath = (Get-Location).Path }

$port = Read-Host "PORT (서버 포트) [기본: 8080]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = "8080" }

$hostValue = Read-Host "HOST (서버 바인딩 호스트) [기본: 127.0.0.1]"
if ([string]::IsNullOrWhiteSpace($hostValue)) { $hostValue = "127.0.0.1" }

$allowedOrigins = Read-Host "ALLOWED_ORIGINS (허용 Origin, 쉼표 구분) [기본: 로컬 Vite Origin들]"
if ([string]::IsNullOrWhiteSpace($allowedOrigins)) { $allowedOrigins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173" }

$token = Read-Host "MAESTRO_SERVER_TOKEN (인증 토큰, 빈 값으로 두면 인증 없음)"

$wsUrl = Read-Host "VITE_WS_URL (WebSocket 주소) [기본: ws://$hostValue:$port]"
if ([string]::IsNullOrWhiteSpace($wsUrl)) { $wsUrl = "ws://$hostValue:$port" }

$content = @"
# Maestro Coding — 환경변수 (자동 생성)
# ⚠️ 이 파일은 절대 Git에 커밋하지 마세요!

MAIN_REPO_PATH=$mainRepoPath
PORT=$port
HOST=$hostValue
ALLOWED_ORIGINS=$allowedOrigins
MAESTRO_SERVER_TOKEN=$token
VITE_WS_URL=$wsUrl
"@

Set-Content -Path $envFile -Value $content -Encoding UTF8

Write-Host ""
Write-Host "✅ .env 파일이 생성되었습니다: $envFile"
Write-Host ""
Write-Host "서버를 시작하려면:"
Write-Host "  npm run server"
