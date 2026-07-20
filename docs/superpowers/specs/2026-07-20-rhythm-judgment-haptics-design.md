# 리듬 판정 & 햅틱 피드백 설계 (2026-07-20)

## 배경

터치 UX 감사·개선(트랙 F, PR #17) 완료에 이은 "스팀덱 + 리듬게임 보조 데크" 정체성 강화 2단계.
현재 보드는 노트 낙하·판정선·콤보·타격음·SFX 버스트를 갖췄지만, 두 가지가 비어 있다:

1. **타이밍 판정 없음** — `triggerLaneAction`은 노트 위치와 무관하게 무조건 `+100`/`MERGED!`.
   콤보·점수가 타이밍의 결과가 아니어서 리듬게임의 알맹이(판정 등급)가 없다.
2. **촉각 피드백 없음** — `navigator.vibrate` 미사용. 등급별 소리 구분도 없다.

관련 스펙: [`2026-07-16-touch-ux-audit-design.md`](2026-07-16-touch-ux-audit-design.md) (선행, 완료)

## 핵심 결정 (합의됨)

- **MISS는 점수전용(안전)**: 판정 등급·콤보는 게임 점수에만 영향. 노트는 어떤 등급이든
  정상 승인(머지)되며, **실제 머지/반려를 자동 처리하는 일은 절대 없다**. 실/모크 모드 동일.
- **햅틱 기본 ON + 헤더 토글**(localStorage 저장). `navigator.vibrate` 미지원 환경(iOS Safari 등)은
  조용히 무시.
- **실제 BGM BPM 동기화는 범위 밖**: "비트 피드백"은 히트 기반 오디오·비주얼·햅틱으로 한정.

## 목표 / 성공 기준

- 승인 탭의 판정 등급(PERFECT/GREAT/EARLY/LATE)이 판정선 근접도로 결정되고, 등급별로
  점수·콤보·사운드·햅틱·비주얼이 달라진다.
- 등급과 무관하게 승인 액션은 기존과 동일하게 전송된다(안전 회귀 테스트로 보장).
- 햅틱 토글 OFF 시 vibrate가 호출되지 않는다.
- `npm run qa` 통과.

## 설계

### A. 아키텍처

- **`src/utils/judgment.js`(신규)** — 순수 판정 로직. React 무관, 단위 테스트 대상.
  ```
  gradeHit({ noteBottom, lineBottom, now, arrivedAt }) → { grade, score, comboDelta }
  ```
- **`src/utils/haptics.js`(신규)** — `vibrate(pattern)` 래퍼. feature-detect + enabled 플래그 존중.
  패턴 상수(`HAPTIC_PATTERNS`)를 함께 export.
- **`src/constants/maestro.js`** — 판정 창/점수 상수 추가(튜닝 한 곳).
- **`src/App.jsx`** — 승인 경로에서 `gradeHit` 결과로 점수/콤보/피드백/사운드/햅틱 분기.
  반려·네트워크 로직 불변.
- **`useMaestroGameLoop`** — 노트가 판정선에 도달한 시각 `arrivedAt`을 노트에 1회 기록
  (LATE 판정용).

### B. 판정 등급 (점수전용)

판정선(`BASE_BOTTOM`) 대비 대상 노트(레인 맨 앞)의 `currentBottom` 거리 + 도달 후 경과 시간:

| 등급 | 조건 | 점수 | 콤보 |
|---|---|---|---|
| **PERFECT** | 판정선 도달(정지) 후 `LATE_GRACE_MS`(4000ms) 이내 | +100 | +1 |
| **GREAT** | 판정선까지 거리 ≤ `GREAT_WINDOW_PX`(120px) | +70 | +1 |
| **EARLY** | 그보다 위(성급한 탭) | +40 | +1 |
| **LATE** | 도달 후 `LATE_GRACE_MS` 초과 방치 | +10 | **0으로 리셋** |

- **판정 순서(모호성 제거)**: ① 노트가 판정선 도달(정지) 상태면 경과 시간으로
  PERFECT(grace 이내) 또는 LATE(초과) — 거리 조건보다 우선. ② 미도달이면 거리로
  GREAT(≤120px) 또는 EARLY(>120px). 도달 노트의 거리는 0이므로 GREAT 조건과 겹치지만
  ①이 항상 우선한다.
- "정지 노트를 제때 친다"가 이 게임의 리듬이므로 PERFECT는 도달 직후 구간.
- 빈 레인 탭 → 기존 `EMPTY`(콤보 리셋) 유지. 반려는 등급 없음(기존 흐름).
- 노트는 등급과 무관하게 동일하게 승인 전송·제거된다.
- 등급 표시: 기존 `showFeedback` 재사용 (PERFECT=보라/금색, GREAT=초록, EARLY=파랑, LATE=회색).

### C. 등급별 감각 피드백

- **사운드**: `playBeep` 확장 — 등급별 주파수 배율/파형(PERFECT 고음 triangle 2연타,
  GREAT 단일 고음, EARLY 중음, LATE 저음 둔탁). 기존 레인별 주파수(`LANE_HIT_FREQS`) 기반 상대 변화.
- **햅틱**(`HAPTIC_PATTERNS`): PERFECT `[15]` / GREAT `[10]` / EARLY `[8]` / LATE `[40,30,40]` /
  REJECT 확정 `[25,20,25]` / 콤보 10단위 달성 `[10,10,10,10]`.
- **판정선 플래시**: 탭 순간 해당 레인 판정선이 등급 색으로 짧게 발광(기존 SFX 버스트 옆).
- **햅틱 토글**: 헤더에 On/Off 버튼(`maestro-touch-control`), localStorage 키
  `maestro:haptics`(기존 `src/utils/storage.js` 사용), 기본 ON.

### D. 범위 밖

- 실제 BGM BPM 추출/동기화, 세션 스코어보드/등급(리절트 화면), 핸드헬드 그립 레이아웃.
- 판정 난이도 설정 UI(상수 튜닝으로 갈음).

## 테스트

- **`judgment.test.js`(신규)**: 등급 경계값(거리/시간 경계 각각), 점수/콤보 델타.
- **`haptics.test.js`(신규)**: 패턴 호출, disabled 시 미호출, `navigator.vibrate` 부재 시 무해.
- **UI 테스트**: 등급 피드백 노출(PERFECT/LATE 시나리오), **안전 회귀** — LATE여도 APPROVE
  payload는 동일 전송, 콤보 리셋만 발생. 햅틱 토글 OFF 저장 후 vibrate 미호출.
- `npm run qa` 통과.
