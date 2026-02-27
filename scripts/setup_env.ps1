# scripts/setup_env.ps1 — .env 파일 초기 설정 스크립트 (Windows PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $RootDir ".env"
$ExampleFile = Join-Path $RootDir ".env.example"

if (Test-Path $EnvFile) {
    Write-Host ".env 파일이 이미 존재합니다: $EnvFile"
    $answer = Read-Host "덮어쓰시겠습니까? (y/N)"
    if ($answer -notmatch "^[yY]$") {
        Write-Host "취소되었습니다."
        exit 0
    }
}

Copy-Item -Path $ExampleFile -Destination $EnvFile -Force
Write-Host ".env 파일이 생성되었습니다: $EnvFile"
Write-Host ""
Write-Host "다음 항목을 편집하여 실제 값을 입력하세요:"
Write-Host "  MAIN_REPO_PATH — git merge를 수행할 로컬 레포지토리 경로"
Write-Host "  MAESTRO_SERVER_TOKEN — API 인증 토큰 (선택)"
Write-Host ""
Write-Host "편집 예시:"
Write-Host "  notepad $EnvFile"
Write-Host "  또는: code $EnvFile"
