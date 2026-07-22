# Claude Code 플러그인 — 플러그인화 트랙 2단계

- 날짜: 2026-07-22
- 상태: 구현 진행
- 선행: 1단계 서버 임베드 모듈 + CLI (PR #32 머지). 플러그인 공식 규격은 문서 조사로 확인 완료(하단 근거).

## 1. 목표

Claude Code 사용자가 **`/plugin marketplace add redsunjin/maestro-coding` → `/plugin install maestro@maestro`** 두 명령으로:
1. 세션 시작 시 Maestro 승인 서버가 자동으로 떠 있고 (이미 있으면 재사용),
2. Claude가 응답을 마칠 때마다(Stop) 승인 요청이 자동 전송되며(기존 notify-maestro.sh 시맨틱),
3. `/maestro:status`로 서버 상태·대시보드 연결 방법을 확인할 수 있다.

**비범위**: VS Code 확장(후속), 플러그인용 대시보드 번들(dist는 vite dev/GH Pages로 서빙 — 서버만 플러그인이 관리), npm 퍼블리시.

## 2. 구조 결정 — 저장소 자체가 마켓플레이스 + 플러그인

서버 코드(maestro-server.js, lib/, bin/)가 플러그인 실행에 필요하므로 플러그인 source는 저장소 루트(`"./"`)로 한다. `.claude-plugin/`에 `marketplace.json`(카탈로그)과 `plugin.json`(매니페스트)이 공존하고, 플러그인 전용 자산은 `plugin/` 디렉터리로 격리한다(기존 `hooks/`는 에이전트 연동 자산이라 그대로 둠).

```
.claude-plugin/
├── marketplace.json      # { name: "maestro", plugins: [{ name: "maestro", source: "./" }] }
└── plugin.json           # hooks/skills/monitors 경로 선언
plugin/
├── hooks.json            # SessionStart(의존성 보장) + Stop(승인 요청)
├── monitors.json         # maestro-server 장수명 실행 (공식 패턴)
├── scripts/
│   ├── ensure-deps.sh    # node_modules/ws 없으면 ws+bonjour-service만 설치
│   └── run-server-quiet.sh # 서버 실행 + 핵심 이벤트만 stdout (모니터 소음 방지)
└── skills/
    └── status/SKILL.md   # /maestro:status
```

## 3. 컴포넌트 상세

### 3.1 plugin.json
`name: "maestro"`, `version`은 package.json과 동기(0.95.0), `hooks: "./plugin/hooks.json"`, `skills: "./plugin/skills/"`, `experimental.monitors: "./plugin/monitors.json"`.

### 3.2 서버 자동 기동 — monitors (공식 장수명 패턴)
- 조사 결과: SessionStart/Stop 훅은 단기 커맨드용, 장수명 프로세스는 `monitors`가 공식 메커니즘(`when: "always"`, 세션 종료 시 자동 정리, stdout 라인이 이벤트로 전달).
- `run-server-quiet.sh`: `ensure-deps.sh` 후 `node "${CLAUDE_PLUGIN_ROOT}/bin/maestro-server.mjs" --repo "${CLAUDE_PROJECT_DIR}"` 실행, stdout은 `grep --line-buffered`로 **기동/재사용/승인 요청 수신/실패**만 통과(서버 배너·mDNS 로그 등 소음 차단).
- 중복 방지는 1단계의 `reuseExisting`이 담당 — 세션이 여러 개여도 서버 1개.
- monitors는 experimental이므로: 미지원 버전 폴백은 `/maestro:status` 스킬이 수동 기동 명령을 안내.

### 3.3 의존성 부트스트랩 — SessionStart 훅
설치된 플러그인 사본에는 node_modules가 없다. 서버 런타임 의존성은 `ws`(+선택 `bonjour-service` — 부재 시 서버가 조용히 광고 생략)뿐이므로, `ensure-deps.sh`가 `node_modules/ws` 부재 시에만 `npm install --no-save --omit=dev --ignore-scripts ws bonjour-service`를 수행한다(수 초, 1회). 실패해도 exit 0(세션 차단 금지) + 안내 한 줄.

### 3.4 Stop 훅 — 승인 요청 자동 전송
기존 `hooks/notify-maestro.sh`를 그대로 사용: `"${CLAUDE_PLUGIN_ROOT}"/hooks/notify-maestro.sh`. 검증 완료: 서버 부재/오류 시에도 exit 0이라 세션을 깨지 않는다. git 정보 자동 감지·토큰 env 지원 등 기존 시맨틱 불변. `install:hook`(settings 직접 설치) 경로도 그대로 유지 — 플러그인은 추가 배포 채널이다.

### 3.5 /maestro:status 스킬
`allowed-tools: Bash`. 지침: ① `curl -s http://127.0.0.1:8080/health` 파싱해 상태·활성 프로젝트·클라이언트 수 보고 ② 대시보드/iPad 연결 방법(ws 주소, `--host 0.0.0.0` 안내) ③ 서버 부재 시 수동 기동 명령 안내.

## 4. 테스트 전략 (TDD)

`tests/plugin-manifest.test.mjs` (node:test):
1. `plugin.json`/`marketplace.json`/`hooks.json`/`monitors.json` JSON 파싱 + 필수 필드(name kebab-case, source "./", monitors의 name/command)
2. 매니페스트가 참조하는 모든 스크립트/스킬 파일 존재 + 스크립트 실행 비트
3. `ensure-deps.sh`: node_modules/ws가 이미 있으면 npm 미호출로 즉시 exit 0 (현 레포에서 실행해 검증)
4. `notify-maestro.sh`: 죽은 포트 대상 실행 → exit 0 (Stop 훅 안전성 고정)
5. `run-server-quiet.sh` 스모크: 임시 git 레포 + 랜덤 포트로 실행 → health OK + stdout에 기동 라인만(배너 소음 없음) → SIGTERM 정리

수동 검증(문서화): `/plugin marketplace add ./` → `/plugin install maestro@maestro` → 새 세션에서 서버 자동 기동 + `/maestro:status` + Stop 훅 승인 요청 수신.

## 5. 리스크순 로드맵

| 순서 | 작업 | 리스크 |
|---|---|---|
| 1 | plugin/ 스크립트 2종 + 매니페스트 4종 + 테스트 1–5 | 중 (monitors 규격·경로 변수) |
| 2 | /maestro:status 스킬 + USER_GUIDE 플러그인 설치 섹션 + 수동 검증 체크리스트 | 저 |

## 6. 자율 진행 중 내린 결정

1. 플러그인 source = 저장소 루트 — 서버 코드 동봉을 위해. 전용 자산만 `plugin/`로 격리.
2. 서버 기동은 monitors(공식 패턴) + reuseExisting — SessionStart에서 detach 실행하는 변칙 대신.
3. 런타임 의존성은 ws(+bonjour-service)만 지연 설치 — 전체 npm install(react 등) 회피.
4. 포트는 기본 8080 고정(서버 기본과 일치). 사용자 정의는 후속(userConfig) 과제로 명시.

## 근거 (플러그인 규격 조사, 2026-07-22)
- plugin.json: `name`만 필수, `hooks`/`skills` 경로 선언, `experimental.monitors`
- hooks.json: `{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/..." }] }] } }`
- monitors.json: `[{ name, command, description, when: "always" }]` — 장수명 프로세스 공식 메커니즘, 세션 종료 시 정리
- marketplace: `.claude-plugin/marketplace.json` + `/plugin marketplace add <owner>/<repo>` + `/plugin install <plugin>@<marketplace>`
- 변수: `${CLAUDE_PLUGIN_ROOT}`(설치 사본 절대경로), `${CLAUDE_PROJECT_DIR}`(프로젝트 루트), `${CLAUDE_PLUGIN_DATA}`(영구 저장소)
