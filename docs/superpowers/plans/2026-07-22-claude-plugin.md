# Claude Code 플러그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/plugin marketplace add redsunjin/maestro-coding` → `/plugin install maestro@maestro`로 서버 자동 기동(monitors)·Stop 승인 훅·`/maestro:status`를 제공한다.

**Architecture:** 저장소 루트 = 플러그인 source. `.claude-plugin/`에 marketplace/plugin 매니페스트, `plugin/`에 hooks.json·monitors.json·스크립트·스킬. 서버 기동은 1단계 CLI(`bin/maestro-server.mjs`)를 monitors가 실행, 중복은 reuseExisting이 방지.

## Global Constraints
- 기존 dev 흐름·`install:hook` 경로 불변. 훅/스크립트는 어떤 실패에도 exit 0(세션 차단 금지).
- 스펙: `docs/superpowers/specs/2026-07-22-claude-plugin-design.md` (§2 구조, §3 상세, §4 테스트 1–5)

### Task 1: 매니페스트 4종 + 스크립트 2종 + `tests/plugin-manifest.test.mjs` (TDD)
- [ ] 실패 테스트 5종(스펙 §4): 매니페스트 파싱/필드, 참조 파일 존재+실행 비트, ensure-deps 즉시 exit 0, notify-maestro 죽은 포트 exit 0, run-server-quiet 스모크(health OK·소음 없음·SIGTERM 정리)
- [ ] 구현: `.claude-plugin/{marketplace,plugin}.json`, `plugin/{hooks,monitors}.json`, `plugin/scripts/{ensure-deps,run-server-quiet}.sh` → PASS
- [ ] `npm run test:server` 전체 PASS → Commit `feat(plugin): package maestro as a Claude Code plugin`

### Task 2: `/maestro:status` 스킬 + 문서 + PR
- [ ] `plugin/skills/status/SKILL.md`(allowed-tools: Bash, health 파싱→상태 보고→연결/기동 안내) + 테스트에 스킬 파일 존재 포함
- [ ] USER_GUIDE "Claude Code 플러그인으로 설치" 섹션(설치 2명령 + 수동 검증 체크리스트)
- [ ] `npm run qa` && e2e → Commit → PR → CI

## Self-Review 결과
스펙 §3.1–3.4→T1, §3.5·수동검증→T2. 갭 없음.
