# Maestro Player 덱 탭 설계 (빈티지 오디오 셀렉터)

- 날짜: 2026-08-04
- 상태: 확정 (사용자 요청 — "한 화면이 너무 길다, 오디오 기기 버튼처럼 목적 단위 탭으로")
- 범위: `player/` 하위만 (본체·workflow 불가침, G-규칙 계승)

## 0. 목표

Player 단일 화면(세로로 매우 긴 2컬럼)을 **빈티지 오디오 기기의 소스 셀렉터
버튼** 스타일의 4탭으로 재구성해 스크롤을 없앤다.

## 1. 탭 구성 (사용자 확정)

| 탭 | 라벨(ko/en) | 내용 (기존 패널 재배치) |
| --- | --- | --- |
| source | 소스 / SOURCE | (web) SourceModeTabs + SourceModeGuide + SourceInputPanel, (extension) ExtensionPublicLauncher — 공통으로 GoldenListeningPanel |
| play | 플레이 / PLAY | PlayerRunPanel |
| session | 세션 / SESSION | ReplayStatusPanel + ReplayEventTimeline |
| records | 기록 / RECORDS | ScoreHistoryPanel |

- 초기 탭: `source`.
- **자동 전환(사용자 확정)**: 리플레이 로드 성공 또는 golden demo 자동 재생
  시작 시 `play` 탭으로 전환한다 (수동 로드·확장 자동 로드·golden 모두 동일
  경로의 성공 지점에서).
- 패널은 **언마운트하지 않는다** — 비활성 탭은 `hidden` 속성으로 숨겨
  PlayerRunPanel의 런 상태/오디오/키 입력 준비가 탭 전환에도 유지되게 한다.
  (PlayerRunPanel의 키보드 리스너가 hidden 상태에서도 동작하는 부작용은
  런 진행 중 탭을 옮기는 예외 상황이므로 MVP에서 허용한다.)

## 2. 셀렉터 UI (`PlayerDeckTabs.jsx` 신규)

- `role="tablist"` + 버튼 4개(`role="tab"`, `aria-selected`), 클릭 시 전환.
- 빈티지 오디오 스타일: 크고 각진 버튼, 상단에 **LED 인디케이터** 점:
  - source: 항상 켜짐(전원 느낌) 또는 활성 탭 표시와 동일 처리
  - play: `chart` 존재 시 점등 (재생 가능 신호)
  - session: `activeSource` 존재 시 점등
  - records: 점수 기록 1건 이상 시 점등
- 스타일은 `player/src/styles.css`의 기존 토큰(암색 배경, 시안 악센트)을 따르되
  `.player-deck-tabs` 계열 클래스로 추가. 활성 버튼은 눌린(pressed) 음영 +
  악센트 보더.
- 라벨 카피는 기존 copy 모듈(ko/en)에 `deckTabs` 섹션으로 추가.

## 3. 오류 가시성

`errorMessage`는 현재 session 탭의 ReplayStatusPanel에만 보인다. 탭 도입 후
source 탭에서 로드 실패를 볼 수 없으므로, **탭리스트 아래 전역 오류 배너**를
추가한다 (errorMessage 존재 시 모든 탭에서 보임, 기존 ReplayStatusPanel 표시는
유지).

## 4. 테스트

- `PlayerDeckTabs.test.jsx`(신규): 4버튼 렌더, 클릭 시 onSelect 호출,
  `aria-selected` 반영, LED 점등 상태 클래스.
- `App.ui.test.jsx`(추가): ① 초기 탭 source — play 패널이 hidden, ② golden
  autoplay 클릭 시 play 탭 자동 전환(run 패널 표시), ③ 로드 실패 시 전역 오류
  배너 표시.
- 기존 App/패널 테스트 무회귀 (`npm run qa --prefix player`).

## 5. 비범위

- 패널 내부 리팩터링, 레이아웃 외 동작 변경 없음.
- extension popup UI 변경 없음 (player 페이지만).
- 로드맵 G2의 오류 UX 하드닝은 별도 (이 스펙은 §3의 배너까지만).
