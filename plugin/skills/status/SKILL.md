---
name: status
description: Maestro 승인 서버의 상태, 활성 프로젝트, 대시보드/iPad 연결 방법을 확인한다
allowed-tools: Bash
---

Maestro 승인 서버 상태를 확인하고 사용자에게 보고하세요.

1. `curl -s http://127.0.0.1:8080/health` 를 실행합니다.
2. 응답이 오면 JSON을 파싱해 다음을 한국어로 요약 보고합니다:
   - 서버 상태(`status`), 연결된 대시보드 수(`clients`)
   - 활성 프로젝트 이름과 경로(`project.name`, `project.path`) — 승인 시 실제 git merge가 실행되는 저장소입니다
   - 대시보드 연결 주소: `ws://localhost:8080` (같은 Wi-Fi의 iPad에서는 `ws://<이 PC의 LAN IP>:8080`, LAN 접속을 열려면 서버를 `--host 0.0.0.0`으로 실행)
3. 연결에 실패하면(서버 없음) 다음을 안내합니다:
   - 이 플러그인의 monitor가 서버를 자동 기동하므로 잠시 후 다시 시도해 보라는 것
   - 수동 기동: 플러그인 폴더에서 `node bin/maestro-server.mjs --repo <관리할 git 레포 경로>`
4. 마지막에 대기 중인 승인 요청이 있는지 `curl -s "http://127.0.0.1:8080/api/history?limit=5"` 로 최근 이력을 확인해 간단히 덧붙입니다 (실패 시 생략).

보고는 5줄 이내로 간결하게 작성하세요.
