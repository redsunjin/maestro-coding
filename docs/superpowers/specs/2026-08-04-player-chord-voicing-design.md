# Maestro Player 화음 발성 2단계 설계 (코드 컬러 보이싱 + 베이스)

- 날짜: 2026-08-04
- 상태: 확정 (음높이 배선 1단계의 예고된 후속)
- 범위: `player/` 하위만

## 0. 목표

1단계에서 멜로디 음높이가 조성·선법에 배선됐다. 2단계는 지금까지 라벨로만
존재하던 `harmony.chordColor`(triad/add9/sus2/sus4/maj7/flat7)를 실제
동시 발성으로 만들고 베이스 토닉을 깔아 "화성이 울리는" 소리를 만든다.

## 1. 규칙

- `musicTheory.buildChordOffsets(chordColor, mode)`: 컬러별 기본 구성음
  (triad [0,4,7], add9 +14, sus2 [0,2,7], sus4 [0,5,7], maj7 +11, flat7 +10)을
  **선법 스케일에 스냅** — 단3도 선법(dorian/phrygian/aeolian)에서는 3도가
  자동으로 단3도(3)로 조정된다. 결과적으로 스케일 적합률 게이트가 유지된다.
- `chartMapper`: **accent·hold 노트에만** `chordMidis` 부여 —
  `[베이스 토닉(36+tonicIndex), ...(48+tonicIndex+chordOffsets)]`.
  tap 노트는 단선율 유지(과밀 방지).
- `replayAudioEngine`: cue에 `chordFrequencies` 전달, 재생 시 메인 음 외에
  화음 음마다 sine 오실레이터 추가(게인 ×0.35, 길이 ×1.6 — 패드 느낌).
  hold는 기존 -1옥타브 메인 위에 화음이 얹혀 패드+베이스 역할.
- `scaleConformance`는 chordFrequencies까지 검사하도록 확장(게이트 강화).

## 2. 테스트

- buildChordOffsets: dorian triad→[0,3,7], dorian maj7의 11→10 스냅.
- chartMapper: accent 노트에 chordMidis(베이스 최저음 포함) 존재, tap에는 없음,
  전부 스케일 적합.
- replayAudioEngine: chordFrequencies가 있는 cue 재생 시 오실레이터 수 =
  1+화음 수, 주파수 목록에 화음 주파수 포함.
- 기존 하니스(스케일·그리드·밀도·도약) + fingerprint 결정성 무회귀.

## 3. 비범위

보이스리딩(전위 선택), 벨로시티 커브, 악기 음색(신스 패치)은 후속.
