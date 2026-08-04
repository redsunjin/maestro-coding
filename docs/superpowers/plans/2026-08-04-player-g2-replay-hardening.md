# Maestro Player G2 하드닝 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** public 리플레이 로드 실패를 원인별 문구+재시도 버튼으로 안내하고, 점수 기록 저장 정책(소스별 50건)을 도입한다.

**Architecture:** `publicRepoAdapter` throw 지점에 `error.code` 부여(RATE_LIMITED/NOT_FOUND/API_ERROR/NETWORK/INVALID_URL/UNSUPPORTED_HOST). App은 code→copy 매핑으로 전역 배너에 표시하고 마지막 로드 시도를 재실행하는 재시도 버튼 제공. 이벤트 0건은 EMPTY_HISTORY로 분류해 플레이 탭 자동 전환을 막는다. `performanceHistoryStore`는 sourceKey별 50건 + 전체 200건 상한.

**스펙:** `docs/superpowers/specs/2026-08-04-player-g2-replay-hardening-design.md`

## Global Constraints

- 수정 범위: `player/` 하위만. 코드 값·상한은 스펙 §1·§2 그대로.
- TDD: 각 태스크 RED→GREEN, 커밋 한국어 본문 + Co-Authored-By.

### Task 1: publicRepoAdapter 오류 코드 (RED→GREEN→커밋)

`tests/publicRepoAdapter.test.mjs`에 코드 단언 추가(403/429→RATE_LIMITED, 404→NOT_FOUND, 500→API_ERROR, fetch reject→NETWORK, 잘못된 URL→INVALID_URL, 비지원 호스트→UNSUPPORTED_HOST) 후 어댑터 throw 지점에 `Object.assign(new Error(...), { code })` 적용. fetch 호출을 try/catch로 감싸 NETWORK 부여.

### Task 2: performanceHistoryStore 소스별 상한 (RED→GREEN→커밋)

테스트: 같은 sourceKey 51건 append 시 가장 오래된 1건 삭제·다른 소스 유지, 전체 200건 상한. 구현: `MAX_RECORDS_PER_SOURCE = 50`, `MAX_TOTAL_RECORDS = 200`으로 append/load 정규화 교체(기존 18 전역 상한 제거).

### Task 3: App 배너 분류+재시도 + EMPTY_HISTORY (RED→GREEN→커밋)

copy에 `errors.publicLoad.{invalidUrl,unsupportedHost,rateLimited,notFound,apiError,network,emptyHistory}` + `retryLabel` (ko/en). App: `loadError` state `{ code, message }`, 배너에 분류 문구+`다시 시도` 버튼(마지막 시도 재실행, useRef로 파라미터 보존 불필요 — handleLoadReplay가 drafts를 읽으므로 단순 재호출). `applyReplayResult`에서 이벤트 0건이면 EMPTY_HISTORY 설정 + `play` 전환 생략. App.ui.test: 403→rate-limit 배너+재시도 성공 흐름, 0건→소스 탭 유지.

### Task 4: 세션 정책 테스트 + 문서 + 검증 + PR

`tests/extensionSession.test.mjs`(신규): writeLastLaunch 2회 → readLastLaunch가 마지막 1건만 반환. `player/README.md`에 저장 정책 명시, 로드맵 G2 진행 기록. `npm run qa`+`build:extension`+g1 하니스 재실행 후 PR.
