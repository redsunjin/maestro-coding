# Maestro Player 덱 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player 단일 긴 화면을 빈티지 오디오 셀렉터 스타일 4탭(소스/플레이/세션/기록)으로 재구성한다.

**Architecture:** `PlayerDeckTabs` 셀렉터(신규) + App의 `deckTab` 상태. 패널은 `hidden` 속성으로 숨겨 상태를 보존하고, `applyReplayResult` 성공 지점에서 `play` 탭으로 자동 전환한다. 전역 오류 배너를 탭 아래 추가한다.

**Tech Stack:** React 19, vitest + testing-library, 기존 playerI18n/styles.css 토큰.

**스펙:** `docs/superpowers/specs/2026-08-04-player-deck-tabs-design.md`

## Global Constraints

- 수정 범위: `player/src/` + 이 문서. 탭 id는 `source|play|session|records`, 초기값 `source`.
- 패널 언마운트 금지 — `hidden` 속성 사용.
- LED 인디케이터: source=항상, play=`chart.notes.length>0`, session=`activeSource` 존재, records=기록 1건 이상.
- 커밋 한국어 본문 + Co-Authored-By.

### Task 1: copy + PlayerDeckTabs 컴포넌트 (TDD)

- `playerI18n.js` en/ko에 `deckTabs: { ariaLabel, source, play, session, records }` 추가 (en: Player deck/Source/Play/Session/Records, ko: 플레이어 덱/소스/플레이/세션/기록).
- `PlayerDeckTabs.test.jsx`(신규): 4버튼(role=tab) 렌더, `aria-selected` 반영, 클릭 시 `onSelect(tab)` 호출, `indicators.play=true`면 해당 LED에 `--on` 클래스.
- `PlayerDeckTabs.jsx`(신규): `{ activeTab, onSelect, indicators, language }` props, role=tablist, LED `span` + 라벨.
- RED→GREEN 확인 후 커밋.

### Task 2: App 통합 + 기존 테스트 갱신 (TDD)

- `App.ui.test.jsx` 추가: ① 초기 상태 — play 패널 hidden(`Run session` 헤딩 not visible), 탭리스트 표시. ② golden autoplay → play 탭 자동 전환(기존 L169 테스트가 겸함 — 통과 유지 확인). ③ 로드 실패 시 전역 배너(role=alert) 표시.
- 기존 단언 갱신: 세션 패널 가시성 단언(L53, L89-92, L111-114, L141-142)은 해당 시점에 Session 탭 클릭 후 단언.
- `App.jsx`: `deckTab` state, `applyReplayResult`에 `setDeckTab('play')`, `player-grid` 2컬럼을 4개 `hidden` 섹션으로 재배치(소스 탭 내부는 입력/골든 2컬럼 grid 유지), 오류 배너.
- 전체 vitest GREEN 후 커밋.

### Task 3: 스타일 + 검증 + PR

- `styles.css`: `.player-deck-tabs`(flex), `.player-deck-tab`(청키 버튼, active pressed), `.player-deck-tab__led`(`--on` 시 시안 글로우), `.player-deck__error`, `.player-deck__panel`.
- `npm run qa --prefix player` + `npm run build:extension` 통과, Playwright/프리뷰로 탭 동작 스크린샷 확보.
- 커밋 + PR + CI 확인.
