# Phase B-0 Work Console Shell UI Plan

기준일: 2026-03-29
대상 트랙: `VU-001`
상태: 구현 계획 초안

## 1. 목적

이 단계의 목적은 OpenClaw 연동 전체를 바로 구현하는 것이 아니라, `Work Console`이 들어갈 UI 껍데기를 먼저 안정적으로 도입하는 것이다.

이번 단계에서 반드시 해결해야 하는 문제:

- Work Console 패널을 여닫을 수 있어야 한다.
- 패널 위치를 좌/우로 이동할 수 있어야 한다.
- 현재 `History/Repo/AutoOps`와 충돌 없이 공존해야 한다.
- 실제 세션 데이터가 아직 없어도 빈 상태와 입력창 쉘은 보여야 한다.

## 2. 이번 단계의 범위

### 포함

- 헤더 `Work` 토글 버튼
- Work Console 패널 쉘
- 좌/우 도킹 상태 전환
- 열기/닫기 상태 저장
- 세션 리스트 자리와 현재 세션 자리 레이아웃
- 명령 입력창 껍데기
- 빈 상태 메시지
- 접근성 속성
- 로컬 저장(`dock side`, `open/closed`)
- UI 회귀 테스트

### 제외

- 실제 `WorkSession` API 연동
- 메시지 전송
- plan/commit/delivery 카드
- OpenClaw connector
- 명령 실행 로직

## 3. 성공 기준

- `Work` 버튼으로 패널을 열고 닫을 수 있어야 한다.
- 패널 위치를 왼쪽/오른쪽으로 바꿀 수 있어야 한다.
- 새로고침 후 도킹 위치와 열림 상태가 복원되어야 한다.
- `History`, `Repo`, `AutoOps` 패널과 동시에 열려도 UI가 망가지지 않아야 한다.
- 기존 승인/반려/UNDO/History 동작에 회귀가 없어야 한다.

## 4. 상태 모델

권장 최소 상태:

| 상태 | 타입 | 설명 |
|---|---|---|
| `isWorkConsoleOpen` | boolean | 패널 열림 여부 |
| `workConsoleDockSide` | `'left' | 'right'` | 현재 도킹 위치 |
| `selectedWorkSessionId` | string \| null | 현재 선택 세션 |

### 로컬 저장 키

- `maestro.work-console.open`
- `maestro.work-console.dock-side`

기본값:

- `open = false`
- `dock-side = right`

## 5. 권장 파일 구조

### 신규 파일

- `src/hooks/useWorkConsoleShell.js`
- `src/components/maestro/WorkConsolePanel.jsx`

### 수정 파일

- `src/App.jsx`
- `src/components/maestro/MaestroHeader.jsx`
- `src/hooks/useMaestroKeyboardControls.js`
- `src/test/appUiHarness.jsx`
- `src/App.work-console.ui.test.jsx`

## 6. 파일별 책임

### `useWorkConsoleShell.js`

담당:

- open/close 상태
- dock side 상태
- localStorage 읽기/쓰기
- `toggle`, `open`, `close`, `moveLeft`, `moveRight`

의도:

- App가 상태 세부 구현을 직접 갖지 않게 분리

### `WorkConsolePanel.jsx`

담당:

- 패널 레이아웃 렌더
- 헤더 액션 렌더
- 세션 리스트 placeholder
- 타임라인 placeholder
- 입력창 placeholder

이번 단계에서는 실제 세션 데이터가 없어도 렌더 가능한 정적 구조가 핵심이다.

### `MaestroHeader.jsx`

담당:

- `Work` 토글 버튼 추가
- `aria-expanded`, `aria-controls`, active 스타일

### `App.jsx`

담당:

- 훅 연결
- 패널 컴포넌트 렌더
- 기존 패널과 z-index/오픈 상태 관계 조정

### `useMaestroKeyboardControls.js`

담당:

- 향후 단축키용 토글 포인트만 마련
- 이번 단계에서는 `W` 또는 추후 정의된 단축키를 넣을지 여부를 문서 기준으로 결정

권장:

- 이번 단계는 단축키 미도입 또는 reserved 상태로 두고, 회귀 위험이 낮아진 뒤 넣는다.

## 7. UI 레이아웃 세부안

### 패널 폭

- 기본 폭: `420px ~ 460px`
- 좁은 화면: `max-width: calc(100vw - 1rem)`

### 내부 분할

상단:

- 제목 `Work Console`
- 도킹 위치 버튼 2개
- 닫기 버튼

중단:

- 좌측 성격의 세션 리스트 영역
- 우측 성격의 현재 세션 뷰 영역

하단:

- 명령 입력 textarea
- 전송 버튼은 disabled 또는 placeholder

### 빈 상태 문구

세션 리스트:

- `아직 열린 작업 세션이 없습니다.`

현재 세션 영역:

- `세션을 선택하면 대화와 작업 카드가 여기에 표시됩니다.`

입력창:

- placeholder만 표시
- 실제 전송은 다음 단계에서 연결

## 8. 접근성 규칙

- 패널 `role="dialog"` 또는 `complementary` 선택 기준을 고정해야 한다.
- 기존 패널 패턴과 맞추기 위해 1차는 `dialog` 패턴 권장
- 오픈 시 첫 포커스는 닫기 버튼 또는 제목 다음 액션 버튼
- `aria-controls`로 헤더 버튼과 연결
- 좌/우 이동 버튼은 명확한 `aria-label` 필요

## 9. 기존 패널과의 충돌 규칙

### 기본 원칙

- Work Console은 `History/Repo/AutoOps`보다 크고 중요도가 높다.
- 동시에 열릴 수는 있지만, 화면이 좁은 경우 겹침을 제어해야 한다.

### 권장 정책

- 넓은 화면: 공존 허용
- 좁은 화면: Work Console 오픈 시 다른 보조 패널 자동 닫기 검토

MVP에서는 보수적으로 가는 편이 낫다.

권장 1차 동작:

- Work Console을 열어도 기존 패널은 유지
- 단, CSS 배치가 겹치면 다음 단계에서 자동 닫기 규칙 도입

## 10. 구현 순서

1. `useWorkConsoleShell` 추가
2. `WorkConsolePanel` 정적 컴포넌트 추가
3. `MaestroHeader`에 `Work` 토글 추가
4. `App.jsx`에 패널 연결
5. localStorage 복원/저장 연결
6. 반응형/도킹 클래스 정리
7. UI 회귀 테스트 추가

## 11. 테스트 계획

### 신규 UI 테스트

권장 파일:

- `src/App.work-console.ui.test.jsx`

검증 항목:

- `Work` 버튼 노출
- 버튼 클릭 시 패널 오픈/닫힘
- 좌우 도킹 버튼 동작
- localStorage 복원
- 기존 `History` 패널과 동시 오픈 가능 여부
- 닫기 버튼 포커스 이동

### 기존 회귀 확인

- `src/App.history.ui.test.jsx`
- `src/App.project-registry.ui.test.jsx`
- `src/App.auto-approve.ui.test.jsx`

최소 게이트:

- `npm run test:ui`

권장 게이트:

- `npm run qa`

## 12. 주요 리스크

### R1. App 과대 비대화

- 패널 상태를 App에 직접 붙이면 다시 App 비대화가 온다.
- 대응: 훅 분리 고정

### R2. 레이아웃 충돌

- 기존 보조 패널과 Work Console이 겹칠 수 있다.
- 대응: 폭/위치 규칙을 먼저 고정하고 회귀 테스트에 포함

### R3. 껍데기 단계의 UX 오해

- 사용자가 “입력창이 있는데 왜 동작 안 하지?”라고 느낄 수 있다.
- 대응: placeholder와 안내 문구로 `다음 단계에서 연결 예정`을 명확히 표기

## 13. Definition of Done

- Work Console이 헤더에서 토글 가능해야 한다.
- 좌우 도킹과 열림 상태가 저장/복원되어야 한다.
- 기존 운영 패널 회귀가 없어야 한다.
- 이후 단계(Session Core, Command Protocol 연결)로 바로 이어질 수 있어야 한다.
