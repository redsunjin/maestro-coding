# Touch UX 감사·개선 설계 (2026-07-16)

## 배경 / 정체성

Maestro의 시작 메타포는 **오케스트레이션(지휘자)** 이며 그대로 유지한다. 그러나 실제 기능과
작동 방식은 이미 **"스팀덱 + 리듬게임"** 형태를 갖고 있다 — 손에 쥐는 별도 기기(태블릿/터치
스크린)를 메인 개발 화면 옆의 **보조 컨트롤 데크**로 두고, 레인에 떨어지는 승인 노트를 리듬감
있게 처리하는 몰입 경험.

본 프로젝트는 "특정 AI 환경에 완벽히 붙는 통합 도구"를 지향하지 않는다. 대신 **태블릿/터치
스크린을 보조 수단**으로 쓰는 바이브코딩 경험을 강화하는 것이 목적이다. 따라서 마우스 hover나
키보드 단축키에만 의존하는 조작은 정체성과 어긋난다.

이 스펙은 그 정체성 강화의 **1단계 = 터치 UX 감사 및 개선(트랙 F)** 만 다룬다.
후속 스펙에서 다룰 항목은 아래 "범위 밖" 참조.

## 문제 (감사 근거)

현재 대시보드에는 터치 사용에 불친절한 지점이 실재한다.

| # | 문제 | 근거 위치 |
|---|---|---|
| 1 | **hover 전용 조작** — 미리보기(Code) 아이콘이 `opacity-0 group-hover:opacity-100`이라 터치에서 보이지 않음. 노트 제목 강조도 `group-hover:underline`. 헤더 상태는 `title=` 툴팁(마우스 전용). | `src/components/maestro/LaneBoard.jsx:76`, `:79`; `src/components/maestro/MaestroHeader.jsx:219` |
| 2 | **`window.prompt` 반려 사유 입력** — 태블릿에서 전체 블로킹 + 소프트키보드 강제, 시트/취소 UX 부재. | `src/App.jsx:354-361` |
| 3 | **눌리는 느낌(클릭감) 거의 없음** — `active:` press 피드백이 LaneBoard 승인 버튼 1곳뿐. 헤더·패널·탭·모달·반려 버튼 등 나머지 전부 press 피드백 없음. | grep: `active:` 매치 = LaneBoard 1건, 그 외 0건 |
| 4 | **탭 타깃 하한 미달** — 반려 버튼 `min-h-[32px]`(권장 44px 미만), 다수 버튼이 최소 크기 미강제. | `src/components/maestro/LaneBoard.jsx:122` |

## 목표 / 성공 기준

- 대시보드의 모든 1차 인터랙티브 컨트롤이 **눌리는 시각 피드백(press)** 을 갖는다.
- 모든 1차 인터랙티브 컨트롤의 탭 타깃이 **최소 44×44px** 이상이다.
- **마우스 hover / 키보드 단축키 없이도** 모든 핵심 동작(미리보기, 반려 사유 입력 포함)이 터치만으로 가능하다.
- 반려 사유 입력이 `window.prompt` 없이 **터치 친화 인라인 시트**로 동작한다.
- 기존 동작·안전성 회귀 없음: 승인/반려/롤백 네트워크 로직과 실제 `git merge` 경로는 변경하지 않는다.
- `npm run qa` 통과.

## 설계

### 아키텍처 원칙

- **단일 소스의 터치 스타일**: 공통 press/크기/포커스 처리를 한 곳에 정의하고 컨트롤 전반에 적용한다.
  래퍼 컴포넌트로 전면 교체하지 않고(대규모 diff·회귀 위험 회피), **CSS 유틸 클래스**를 className에
  합성하는 방식으로 최소 침습 적용한다.
- **로직 불변**: 승인/반려/롤백/머지 관련 서버 통신·상태 전이는 그대로 두고, **표현·입력 방식만** 개선한다.

### F1. 공통 "클릭감" (press 피드백)

- `src/index.css`에 단일 유틸 클래스 **`.maestro-touch-control`** 정의:
  - press 피드백: `active:scale-95` + `transition-transform`
  - 터치 최적화: `touch-manipulation`, `user-select: none`
  - 탭 타깃 하한: `min-height: 44px; min-width: 44px`
  - 접근성: `:focus-visible` 링(기존 색 토큰과 조화)
- 아이콘 전용 소형 버튼 등 44px 정사각이 과한 경우를 위해 보조 클래스
  **`.maestro-touch-control--compact`**(min 44px 유지, 패딩만 축소)를 함께 제공.
- 대시보드 1차 컨트롤(헤더 버튼, 패널 액션 버튼, 탭, 모달 버튼, 레인 승인/반려 버튼)의
  className에 위 클래스를 합성. 기존 시각 스타일(색/보더/글로우)은 유지.

### F2. 탭 타깃 하한 44px

- F1의 `.maestro-touch-control`이 크기 하한을 강제하므로, 이를 적용하는 것으로 대부분 해소.
- 명시적 교정 대상: LaneBoard 반려 버튼(`min-h-[32px]` → 44px 이상).
- 헤더·패널의 소형 버튼을 훑어 44px 미만 잔여 항목을 교정.

### F3. hover 전용 조작 제거

- **미리보기 어포던스 상시 노출**: `LaneBoard`의 노트에서 미리보기(diff) 아이콘을
  `opacity-0 group-hover:*` 대신 **항상 보이도록** 변경. 노트 자체가 탭=미리보기임을 시각적으로
  명확히(예: 상시 표시되는 작은 "diff" 아이콘/힌트). `group-hover:underline`은 보조 강조로만 남기고
  터치에서도 인지 가능한 상시 단서를 둔다.
- **마우스 전용 툴팁 대체**: `title=` 기반 정보(예: 헤더 YT 상태)를 상시 표시 라벨/칩 또는
  탭으로 확인 가능한 형태로 대체(기존 상태 칩 체계 활용).

### F4. 반려 사유 입력 → 터치 시트

- `src/App.jsx`의 `window.prompt` 경로 제거. 대신 **인라인 반려 시트(컴포넌트)** 도입:
  - 빠른 사유 **칩**(예: "테스트 실패", "설계 불일치", "범위 벗어남", "직접 수정") + **자유 입력** textarea.
  - 큰 **확인/취소** 버튼(`.maestro-touch-control` 적용).
  - **취소 시** 기존 의미 보존: 반려 자체를 취소하고 "REJECT CANCELED" 피드백.
  - **확인 시** 기존과 동일하게 `REJECT` 액션 전송(사유 최대 300자 유지).
- 시트는 비블로킹, 백드롭 탭/취소 버튼으로 닫힘. 대상 노트/레인 컨텍스트를 시트에 전달.
- 기존 `triggerLaneAction(laneId, { isRejectAction, promptFeedback })` 시그니처는 유지하되,
  `promptFeedback` 시 `window.prompt` 대신 시트를 여는 상태로 전환.

### F5. 터치 조작 동등성(파리티) 점검

- `useMaestroKeyboardControls`의 각 단축키 동작에 **눈에 보이는 터치 컨트롤 대응**이 있는지 확인하고
  누락 시 보완(예: 패널 토글, 프로젝트 전환, 롤백).
- `PreviewModal` 등 모달의 **큰 터치 닫기 버튼 + 백드롭 탭 닫기** 보장, 내부 스크롤 터치 동작 확인.
- 우측 도킹 패널들의 터치 스크롤/닫기 동작 확인.
- 산출물: "터치 파리티 체크리스트"를 스펙 구현 중 채워 넣고, 발견된 갭만 수정.

## 컴포넌트 / 파일 영향 범위

- `src/index.css` — `.maestro-touch-control`(+`--compact`) 유틸 신설.
- `src/components/maestro/LaneBoard.jsx` — 미리보기 상시 노출(F3), 반려 버튼 크기(F2), press 클래스(F1).
- `src/components/maestro/MaestroHeader.jsx` — 툴팁 대체(F3), press 클래스(F1).
- `src/components/maestro/*Panel.jsx`, `ProjectTabs.jsx`, `PreviewModal.jsx`, `FooterHelp.jsx` — press 클래스(F1), 모달 닫기/파리티(F5).
- 신규 `src/components/maestro/RejectSheet.jsx`(또는 동등물) — 반려 시트(F4).
- `src/App.jsx` — `window.prompt` 제거 및 반려 시트 상태 배선(F4).

## 테스트

- **UI 테스트(확장/신규)**:
  - 1차 컨트롤이 `maestro-touch-control` 클래스를 갖는다(대표 표본).
  - 반려 흐름: `window.prompt` 미사용, 반려 시트가 뜨고 확인 시 `REJECT`가 (사유 포함) 전송, 취소 시 미전송 + "REJECT CANCELED".
  - 미리보기 어포던스가 hover 없이 노출된다(클래스/DOM 단언).
  - **안전 회귀**: 승인/반려/롤백 네트워크 액션이 기존과 동일하게 동작(표현 변경이 로직에 영향 없음).
- 기존 `src/App.touch.ui.test.jsx` 보강, 필요 시 `RejectSheet` 단위/상호작용 테스트 추가.
- `npm run qa` 통과, 기존 E2E 깨지지 않음.

## 범위 밖 (후속 스펙)

- **③ 햅틱 + 등급 피드백**(`navigator.vibrate`, 등급별 타격음, 히트 플래시, 햅틱 토글).
- **① 타이밍 판정 시스템**(점수전용: PERFECT/GREAT/EARLY/LATE 등급·콤보, 실제 머지 불간섭).
- 위 두 트랙은 본 트랙 F(공통 press/피드백 토대) 완료 후 별도 스펙으로 진행한다.
- 핸드헬드 그립 레이아웃, 세션 스코어보드/등급, 실제 BGM BPM 동기화는 이번 정체성 강화 범위에서 제외(추후 검토).
- 시각 리브랜딩/전면 재디자인은 하지 않는다. 표현·입력의 터치 대응만 개선한다.
