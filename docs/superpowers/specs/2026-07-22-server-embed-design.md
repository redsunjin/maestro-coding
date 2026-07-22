# 서버 임베드 모듈 + CLI — 플러그인화 트랙 1단계

- 날짜: 2026-07-22
- 상태: 구현 진행
- 배경: Maestro 확산의 병목은 서버 설치 경험("repo clone + npm + .env"). Claude Code 플러그인·VS Code 확장·npx CLI가 모두 같은 방식으로 서버를 띄울 수 있는 **임베드 코어**를 만든다. 2단계(Claude Code 플러그인)는 별도 스펙.

## 1. 접근 결정: 재작성이 아니라 감싸기 (supervisor)

maestro-server.js(약 3,300줄)는 env 기반 top-level 실행 스크립트다. in-process 모듈화(export 분리)는 회귀 리스크가 크고, 소비자(플러그인/확장)에게는 **자식 프로세스가 오히려 더 나은 격리**(호스트 크래시 무영향, 독립 로그)를 준다. 기존 회귀 테스트 하네스가 이미 spawn+health 패턴으로 서버를 구동한다는 것이 이 접근의 검증이다.

→ `startMaestroServer(options)`는 maestro-server.js를 자식 프로세스로 스폰하고 `/health`로 기동을 확인하는 **supervisor 모듈**로 구현한다. 서버 본체는 무변경.

## 2. 임베드 모듈 `lib/server-embed.mjs`

```js
startMaestroServer({
  port = 8080, host = '127.0.0.1',
  repoPath,            // MAIN_REPO_PATH. 생략 시 서버 기본(.env/cwd) 규칙
  mdns = true,         // false → MAESTRO_MDNS=off
  token,               // MAESTRO_SERVER_TOKEN
  reuseExisting = true,// 기동 전 /health 확인, 살아 있으면 재사용
  env = {},            // 추가 env 오버라이드 (스토어 경로 등)
  onLog,               // (line) => void — 자식 stdout/stderr 라인 콜백(선택)
  startTimeoutMs = 15000,
}) => Promise<{
  url, wsUrl, port, host,
  alreadyRunning,      // true면 이 핸들이 소유하지 않음 → stop()은 no-op
  pid,                 // alreadyRunning이면 null
  stop(),              // 소유 시 SIGTERM → 2초 대기 → SIGKILL, 멱등
}>
```

- 실패 규약: 타임아웃/즉시 종료 시 자식을 정리하고 마지막 로그 tail을 담은 Error를 던진다.
- `reuseExisting` 판정: `GET /health` 200 → 재사용. 다른 프로세스가 포트를 점유했지만 health가 아니면 명확한 에러("포트 사용 중, Maestro 아님").
- 서버 본체(maestro-server.js)와 기존 `scripts/run-server.mjs` dev 흐름은 무변경.

## 3. CLI `bin/maestro-server.mjs` (npx 진입점)

- package.json `"bin": { "maestro-server": "bin/maestro-server.mjs" }` — 퍼블리시/`npm link` 시 `npx maestro-server`로 실행.
- 플래그: `--port`, `--host`, `--repo <path>`(기본: cwd가 git 레포면 cwd, 아니면 서버 기본 규칙), `--no-mdns`, `--token <t>`, `--help`.
- 동작: `startMaestroServer({ reuseExisting: true })` 호출 → 기동/재사용 결과와 대시보드 접속 안내(ws 주소, iPad 안내 한 줄) 출력 → 자식 로그를 그대로 전달하며 포그라운드 유지, SIGINT/SIGTERM 시 stop().
- 의존성 추가 없음(플래그 파싱은 node:util `parseArgs`).

## 4. 테스트 전략 (TDD)

`tests/server-embed.test.mjs` (node:test, 기존 하네스 유틸 재사용 가능):
1. 픽스처 git 레포로 기동 → health 200 + project.path 일치 → `stop()` 후 프로세스 종료 확인
2. `reuseExisting`: 이미 떠 있는 서버가 있으면 `alreadyRunning: true` + 새 프로세스 미생성(pid null), stop()이 기존 서버를 죽이지 않음
3. `mdns: false` → 로그에 mDNS 광고 없음
4. 포트를 Maestro 아닌 프로세스가 점유 → 명확한 에러
5. CLI 스모크: `--port --repo --no-mdns`로 스폰 → health → SIGTERM 정상 종료

회귀: `npm run qa` + `npm run test:e2e` 불변(서버 본체·대시보드 무변경이므로 그대로 통과해야 함).

## 5. 리스크순 로드맵

| 순서 | 작업 | 리스크 |
|---|---|---|
| 1 | `startMaestroServer` supervisor + 테스트 1·2·3·4 | 중 (프로세스 수명주기/좀비 방지) |
| 2 | CLI + bin 등록 + 테스트 5 + USER_GUIDE 한 줄 실행 섹션 | 저 |

## 6. 자율 진행 중 내린 결정

1. in-process 리팩터 대신 supervisor 래핑 — 회귀 0 목표, 소비자 격리 이점.
2. `reuseExisting` 기본 on — 플러그인/확장/CLI가 동시에 있어도 서버 1개.
3. 2단계(Claude Code 플러그인)는 공식 규격 조사 완료 후 별도 스펙 — 이 모듈의 `startMaestroServer`를 그대로 소비한다.
