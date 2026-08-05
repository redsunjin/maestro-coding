# Maestro Coding VS Code 확장 설계 (서버 임베드 재사용)

- 날짜: 2026-08-05
- 상태: 확정 (2026-07 다음 후보 목록의 마지막 항목)
- 범위: `vscode-extension/`(신규) + `tests/` + docs. 본체·lib 무변경.

## 0. 목표

Claude Code 플러그인과 같은 소비자 패턴으로, VS Code 안에서 Maestro 서버를
한 명령으로 띄우고 대시보드를 여는 확장. `lib/server-embed.mjs`의
`startMaestroServer` 핸들을 그대로 재사용한다.

## 1. 구성

- `vscode-extension/package.json`: 명령 4종 —
  `maestro.startServer` / `maestro.stopServer` / `maestro.openDashboard` /
  `maestro.showLogs`. 설정 `maestro.port`(기본 8080),
  `maestro.repoPath`(기본: 첫 워크스페이스 폴더).
- `vscode-extension/extension.cjs`: 확장 진입점 —
  OutputChannel("Maestro")로 서버 로그, 상태바 아이템(`$(play) Maestro 8080`
  ↔ `$(circle-slash)`), openDashboard는 Simple Browser 우선·실패 시 외부
  브라우저. deactivate 시 소유 서버 stop (reuse한 서버는 건드리지 않음 —
  embed 핸들 의미 그대로).
- `vscode-extension/lifecycle.cjs`: **vscode 비의존** 상태 머신 —
  `createLifecycle({ embed })` → `start(options)`(중복 시작 방지·재사용 표시),
  `stop()`, `status()`. 단위 테스트 대상.

## 2. 테스트 (`tests/vscode-lifecycle.test.mjs`, 루트 스위트 편입)

가짜 embed 주입으로: ① start→running(url/pid), 중복 start는 기존 핸들 유지,
② stop 후 idle·재시작 가능, ③ embed 실패 시 idle 유지+오류 전파,
④ alreadyRunning(재사용) 상태 구분. VS Code API 통합(F5 개발 호스트)은
수동 스모크로 체크리스트화.

## 3. 배포

MVP는 개발 호스트(F5)/`vsce package` 수동 — 확장이 레포 내 상대경로로
`lib/server-embed.mjs`를 import하므로 패키징 시 레포 동봉 전제.
마켓플레이스 게시는 후속(퍼블리셔 계정 필요).
