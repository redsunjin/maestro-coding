# 핸드헬드 그립 레이아웃 설계 (2026-07-20)

## 배경

"스트림덱 + 리듬게임 보조 데크" 정체성 강화 3단계. 터치 UX(트랙 F, PR #17)와 리듬 판정·햅틱
(PR #20)에 이어, 태블릿을 **두 손으로 쥐고 엄지로 조작**하는 물리적 사용 맥락을 지원한다.

> **정정 노트(2026-07-21)**: 프로젝트 정체성의 "데크" 비유는 스트림덱(거치형 커스텀 버튼
> 컨트롤러)이다("스팀덱"은 오타였음). 본 스펙의 그립 레이아웃은 그 정체성과 별개로,
> 태블릿을 손에 쥐고 쓰는 **선택적 휴대 모드**(기본 OFF 토글)로 유효하게 유지된다.

현재 레인 승인/반려 버튼은 각 레인 하단 중앙에 있어, 태블릿을 쥔 상태에서는 엄지가 닿지
않는다(화면 중앙까지 손을 뻗어야 함). 휴대용 게임기처럼 좌우 그립 존에 컨트롤을 모아 엄지만으로
전 레인을 조작할 수 있게 한다.

선행 스펙: [`2026-07-16-touch-ux-audit-design.md`](2026-07-16-touch-ux-audit-design.md),
[`2026-07-20-rhythm-judgment-haptics-design.md`](2026-07-20-rhythm-judgment-haptics-design.md)

## 핵심 결정 (합의됨)

- **활성화 = 수동 토글**: 헤더 "그립 모드" 버튼, localStorage(`maestro.grip-mode`) 저장,
  기본 OFF. 자동 감지는 오탐(노트북 터치스크린 등) 위험이 있어 하지 않는다.
- **반려 = 롱프레스**: 그립 버튼 짧은 탭 = 승인, **길게 누름(500ms) = 반려 시트 열기**
  (기존 `RejectSheet` 재사용). 버튼 수를 최소로 유지하고 게임패드 감성을 살린다.
  오조작 방지를 위해 누르는 동안 버튼에 진행 링(프로그레스)을 표시한다.

## 목표 / 성공 기준

- 그립 모드 ON 시 좌/우 하단 코너 존에 레인 버튼 클러스터가 나타나고, 엄지 탭만으로
  모든 레인의 승인·반려가 가능하다.
- 짧은 탭은 기존 `triggerLaneAction(laneId)`와 동일한 승인 경로(판정/햅틱 포함)를 탄다.
- 롱프레스는 기존 반려 시트를 연다(사유 칩/자유입력/취소 의미 보존).
- 토글 상태가 localStorage로 유지되고, OFF 시 기존 레이아웃과 완전히 동일하다(회귀 없음).
- `npm run qa` + Playwright e2e 통과.

## 설계

### A. 아키텍처

- **신규 `src/components/maestro/GripZones.jsx`** — 좌/우 그립 존 오버레이 컴포넌트.
  레인 정의(`lanes`)를 받아 좌/우로 분배 렌더, 탭/롱프레스를 콜백으로 위임.
- **신규 `src/hooks/useLongPress.js`** — 재사용 가능한 롱프레스 훅.
  `useLongPress({ onTap, onLongPress, delayMs = 500 })` → pointer 핸들러 세트 반환.
  pointerdown 후 delay 도달 시 onLongPress(1회), 그 전에 pointerup이면 onTap.
  pointerleave/cancel 시 무효. 진행 상태(`isPressing`, `progress`)를 노출해 진행 링 렌더.
- **`src/App.jsx`** — `isGripMode` 상태(localStorage 복원) + 헤더 토글 배선 +
  `GripZones` 렌더(그립 모드 ON + isPlaying일 때). 액션은 기존 `triggerLaneAction` 재사용.
- **`LaneBoard`** — 그립 모드 ON일 때 레인 하단 중앙 승인/반려 버튼 숨김(중복 제거).
  판정선·노트 낙하·피드백·플래시는 그대로.
- **`MaestroHeader`** — "그립" On/Off 토글 버튼(진동 토글과 동일 패턴, `maestro-touch-control`).

### B. 그립 존 배치

- 위치: 화면 좌/우 하단 코너 고정(`fixed`), 세로로 쌓인 버튼 클러스터. 노트 보드 위에
  오버레이되지만 폭을 최소화(코너 ~180px)해 레인 가독성 유지.
- 레인 분배: 왼쪽 존 = 앞 절반(`0..ceil(n/2)-1`), 오른쪽 존 = 뒤 절반. 4레인 기준
  좌 D/F, 우 J/K. 가변 레인(1~8) 대응 — 8레인이면 좌우 4개씩.
- 버튼: 최소 64×64px 원형, 레인 키 문자 + 레인 색(기존 `lane.color`/`lane.border` 재사용),
  `maestro-touch-control` 합성. 존 배경은 반투명 블러 패널.
- 버튼에는 `aria-label="{레인명} 그립 승인 (길게 눌러 반려)"` 부여.

### C. 롱프레스 동작

- 짧은 탭(<500ms): `triggerLaneAction(laneId)` — 기존 판정·사운드·햅틱·플래시 그대로.
- 500ms 도달: 햅틱 짧은 킥(`HAPTIC_PATTERNS.GREAT` 재사용) + `triggerLaneAction(laneId,
  { isRejectAction: true, promptFeedback: true })` — 기존 반려 시트 경로.
- 진행 링: 누르는 동안 버튼 테두리를 따라 오렌지 링이 차오름(CSS `conic-gradient` 또는
  scale 애니메이션). 도달 전 손을 떼면 링 소멸 + 승인으로 처리.
- 롱프레스 중 스크롤/이동(pointerleave) 시 액션 무효.

### D. 범위 밖

- 자동 뷰포트 감지, 세로(portrait) 전용 배치, 버튼 커스텀 매핑, 스와이프 제스처.
- 그립 존에서의 롤백/패널 조작(헤더 유지).

## 파일 영향 범위

- 신규: `src/components/maestro/GripZones.jsx`, `src/hooks/useLongPress.js`
- 수정: `src/App.jsx`(토글 상태+렌더), `src/components/maestro/MaestroHeader.jsx`(토글 버튼),
  `src/components/maestro/LaneBoard.jsx`(그립 모드 시 중앙 버튼 숨김)

## 테스트

- **`useLongPress` 단위 테스트**: 짧은 탭→onTap, 500ms 유지→onLongPress 1회,
  pointerleave 취소, 타이머 정리.
- **UI 테스트**(신규 `App.grip.ui.test.jsx`):
  - 토글 ON → 그립 존 렌더 + localStorage 저장, OFF 복원 시 기존 레이아웃(중앙 버튼) 유지.
  - 그립 버튼 짧은 탭 → APPROVE payload 전송(기존 판정 피드백 포함).
  - 그립 버튼 롱프레스 → 반려 시트 열림, 확정 시 REJECT 전송.
  - 그립 모드 ON 시 레인 중앙 승인 버튼 미노출, OFF 시 노출(회귀).
- **e2e**: 기존 시나리오 무회귀(그립 기본 OFF이므로 영향 없음). 그립 시나리오 추가는 선택.
- `npm run qa` 통과.
