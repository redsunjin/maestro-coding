# Maestro Player 음악 이론 정량 하니스 + 음높이 배선 설계

- 날짜: 2026-08-04
- 상태: 확정 (사용자 "진행" — 검증 방법 제안 ①②를 리스크 낮은 순으로)
- 범위: `player/` 하위만

## 0. 발견된 결함 (이 스펙의 동기)

`replayAudioEngine.createCueFromNote`가 주파수를 **레인 번호 고정 테이블**
([220, 261.63, 329.63, 392, …] ≈ A·C·E·G)에서 만든다. 세션의
`harmony`(tonic/mode)와 `motif.intervals`는 소리에 반영되지 않는 **표시 전용
라벨**이다. 즉 "F dorian" 세션도 항상 같은 Am계 음들만 울린다.

## 1. 정량 하니스 (`src/lib/musicTheory.js` + `tests/musicTheoryHarness.test.mjs`)

이론 테이블과 지표 함수(순수 함수, 픽스처 기반 CI 게이트):

- `MODE_INTERVALS`: harmonyEngine의 7개 선법 → 반음 집합.
- `frequencyToMidi(hz)` / `midiToFrequency(midi)`.
- `scaleConformance(cuePlan, harmony)` → 발음 큐 중 선법 스케일 내 비율 + 위반 목록.
- `beatGridConformance(chart, resolution=0.25)` → 박 그리드 정합 비율.
- `chartMaxNotesPerBeat(chart)` → 밀도 상한 검증용.
- `leapStats(cuePlan)` → 연속 리드 큐의 도약 반음 통계(최대, 옥타브 초과 비율).

하니스 단언 (golden 3픽스처 + transition 픽스처):

- 그리드 정합 = 100%, 밀도 ≤ 2/박.
- **스케일 적합률 ≥ 95%** ← 현재 구조에선 실패(§0 결함의 자동 검출) → §2로 GREEN.
- 도약 옥타브 초과 비율 ≤ 40% (배선 후 실측 캘리브레이션, 회귀 방지 목적).

## 2. 음높이 배선 (결함 수정 = 화음 발성 1단계)

- `chartMapper`: 노트 생성 시 `pitchMidi` 부여 —
  `tonicMidi(registerBand: low=36/mid=48/high=60 + tonicIndex) + motif.intervals[noteIndex % n]`
  를 선법 스케일에 스냅(최근접 스케일음, 하행 우선). hold 노트도 동일 규칙.
- `replayAudioEngine`: `note.pitchMidi`가 있으면 `midiToFrequency` 사용
  (hold는 -12, accent는 +12 옥타브 이동 — 피치 클래스 보존이라 적합률 불변).
  없으면 기존 레인 테이블 폴백(하위 호환).
- 결과: 브랜치별 조성·선법·모티프가 실제 소리에 반영 — "fix 브랜치는 dorian,
  revert는 phrygian"이 귀로 성립하기 시작한다.

## 3. 비범위

- 화음 동시 발성(코드 컬러 보이싱)·베이스/패드 레이어 — 후속 2단계.
- A/B 블라인드 청취, 실저장소 코퍼스 스모크 — 별도 트랙.

## 4. 게이트

`npm run qa` + `build:extension` + golden fingerprint 결정성 유지
(fingerprint는 재실행 간 비교라 pitch 추가에도 결정적이면 통과).
