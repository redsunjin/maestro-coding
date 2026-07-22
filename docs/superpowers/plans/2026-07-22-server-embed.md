# 서버 임베드 모듈 + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `startMaestroServer(options)` supervisor 모듈과 `npx maestro-server` CLI를 제공해 플러그인/확장/CLI가 한 줄로 서버를 띄우게 한다.

**Architecture:** maestro-server.js 무변경. `lib/server-embed.mjs`가 자식 프로세스 spawn + `/health` 대기 + 재사용 판정 + 멱등 stop을 담당. CLI는 이 모듈의 소비자 1호.

**Tech Stack:** node:child_process, node:util parseArgs(신규 의존성 0), node:test.

## Global Constraints
- 서버 본체·대시보드·기존 dev 흐름(`npm run server`) 무변경. `npm run qa` + e2e 그대로 통과.
- 스펙: `docs/superpowers/specs/2026-07-22-server-embed-design.md` (§2 시그니처 준수)

### Task 1: `lib/server-embed.mjs` + `tests/server-embed.test.mjs` (TDD)
- [ ] 실패 테스트 4종: 기동/stop, reuseExisting(alreadyRunning·pid null·stop no-op), mdns:false 로그 부재, 비-Maestro 포트 점유 에러
- [ ] 구현(spawn env 구성: PORT/HOST/MAIN_REPO_PATH/MAESTRO_MDNS/MAESTRO_SERVER_TOKEN + env 오버라이드, 로그 링버퍼로 실패 메시지 구성, SIGTERM→2s→SIGKILL 멱등 stop) → PASS
- [ ] `npm run test:server` 전체 PASS → Commit `feat(embed): add startMaestroServer supervisor module`

### Task 2: CLI + bin + 문서 + PR
- [ ] `bin/maestro-server.mjs`(parseArgs: --port --host --repo --no-mdns --token --help, cwd git 감지, 로그 passthrough, 시그널 stop) + package.json bin
- [ ] CLI 스모크 테스트(스폰→health→SIGTERM) 추가 → PASS
- [ ] USER_GUIDE "한 줄 실행" 섹션 → `npm run qa` && e2e → Commit → PR → CI

## Self-Review 결과
스펙 §2→T1, §3→T2, §4 테스트 1–4→T1/5→T2. 갭 없음.
