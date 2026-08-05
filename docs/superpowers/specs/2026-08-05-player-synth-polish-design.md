# Maestro Player 신스 다듬기 설계 (음색 3단계)

- 날짜: 2026-08-05
- 상태: 확정 (화음 발성 2단계의 예고된 후속 — 벨로시티·엔벨로프·필터)
- 범위: `player/src/lib/` + 테스트

## 1. 벨로시티 커브 (chartMapper)

모든 노트에 `velocity` 부여: `clamp(0.7 + accentLevel×0.3 + energy×0.1, 0.6, 1.1)`
(소수 2자리). 강조 이벤트일수록 실제로 크게 울린다 — 지금까지는 noteType
3단 고정 게인뿐이었다.

## 2. 엔벨로프 (replayAudioEngine)

cue에 `attackSeconds`/`releaseSeconds`를 noteType별로 부여하고 엔진이 사용:

| type | attack | release | 의도 |
| --- | --- | --- | --- |
| tap | 0.008 | 0.06 | 짧고 깔끔한 타격 |
| accent | 0.005 | 0.12 | 즉각 타격 + 여운 |
| hold | 0.03 | 0.2 | 패드성 페이드 |

게인은 `type 기본 게인 × velocity`. release는 duration 이후 꼬리로 감쇠
(기존: 고정 attack 0.01, 종료 시 급감).

## 3. 로우패스 필터 (replayAudioEngine)

voice별 BiquadFilter(lowpass) 삽입 — 멜로디 cue.filterCutoffHz: hold(sawtooth)
1400 / accent(triangle) 2600 / tap(sine) 3200, 화음 패드는 1200 고정.
사각·톱니 하모닉의 날카로움을 정리한다. `createBiquadFilter` 미지원
환경(구형 mock)은 필터 없이 폴백.

## 4. 테스트

- 하니스: 전 픽스처 노트 velocity ∈ [0.6, 1.1], accent 평균 velocity >
  tap 평균 (강조가 실제로 더 크게).
- 엔진: cue 필드(velocity 반영 게인, type별 envelope/cutoff), 드라이버가
  필터 노드를 voice 수만큼 생성·연결. 구필드 없는 cue 폴백 동작.
- fingerprint 결정성·스케일 적합률 등 기존 게이트 무회귀.

## 5. 비범위

보이스리딩(전위), 리버브/딜레이 등 공간계, 악기 다층 패치.
