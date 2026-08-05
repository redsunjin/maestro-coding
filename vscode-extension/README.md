# Maestro Coding VS Code 확장

VS Code 안에서 Maestro 승인 서버를 띄우고 대시보드를 여는 얇은 소비자 —
[`lib/server-embed.mjs`](../lib/server-embed.mjs)의 supervisor 핸들을 그대로 쓴다
(Claude Code 플러그인과 같은 패턴, 서버 코드 무변경).

## 명령

| 명령 | 동작 |
| --- | --- |
| `Maestro: 서버 시작` | 설정 포트(기본 8080)로 서버 기동, 이미 떠 있으면 재사용 |
| `Maestro: 대시보드 열기` | Simple Browser(에디터 안) 우선, 실패 시 외부 브라우저 |
| `Maestro: 서버 중지` | 이 확장이 소유한 서버만 종료 (재사용 서버는 건드리지 않음) |
| `Maestro: 서버 로그 보기` | Output 채널 "Maestro" |

상태바: `▶ Maestro 8080`(클릭=대시보드) ↔ `⊘ Maestro`(클릭=시작).
설정: `maestro.port`, `maestro.repoPath`(비우면 첫 워크스페이스 폴더).

## 개발 실행 (F5)

1. VS Code로 **이 레포 루트**를 연다.
2. 실행 대상: Extension Development Host —
   `.vscode/launch.json` 없이도 `vscode-extension/`을 확장 폴더로 지정해
   `code --extensionDevelopmentPath=$(pwd)/vscode-extension .` 로 실행 가능.
3. 개발 호스트에서 명령 팔레트 → "Maestro: 서버 시작".

## 수동 스모크 체크리스트

- [ ] 서버 시작 → 상태바 `▶ Maestro 8080` + 알림
- [ ] 대시보드 열기 → 레인 UI 표시
- [ ] 이미 떠 있는 서버가 있을 때 시작 → "(기존 서버 재사용)" 표시
- [ ] 서버 중지 → 상태바 `⊘`, 재사용 서버는 살아 있음
- [ ] 창 종료(deactivate) → 소유 서버 정리

## 패키징 (후속)

확장이 레포 상대경로(`../lib`, `../maestro-server.js`)에 의존하므로 `vsce
package`는 레포 동봉 구조가 전제다. 마켓플레이스 게시는 퍼블리셔 계정
확보 후 별도 스펙으로.

라이프사이클 상태 머신은 vscode 비의존(`lifecycle.cjs`)이며 루트 스위트의
`tests/vscode-lifecycle.test.mjs`가 검증한다.
