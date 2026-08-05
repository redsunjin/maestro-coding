# Maestro Player A/B 대조 청취 픽스처 설계

- 날짜: 2026-08-04
- 상태: 확정 ("좋은 코딩이 듣기 좋게 들리는가" 가설의 직접 검증 트랙)
- 범위: `player/` + `docs/maestro-player/` 하위만

## 0. 목표

같은 저장소·같은 PR 번호(= 같은 조성·모티프로 **통제**)에서 이벤트 내용만
다른 두 시나리오를 골든 팩에 추가해, 개발 흐름의 질이 소리 차이로
번역되는지를 ① 자동 지표로, ② 블라인드 청취로 검증 가능하게 한다.

## 1. 픽스처 쌍 (repoId `ab-contrast-showcase`, pr:7 공유)

- **대조 A — 모범 PR 흐름**: 적정 규모 feat 커밋 3 + fix 1 + pr-open →
  review-comment → 반영 → approve → **merge**. 기대: ionian(장조계),
  낮은 평균 긴장, merge가 해소 정점.
- **대조 B — 거친 이력**: 대형 덤프 커밋 + **revert×3** + request-changes +
  reopen, 머지 없음, 짧은 간격 재작업. 기대: phrygian(가장 어두운 선법),
  sus4(긴장 코드), 높은 평균 긴장, 해소 정점 부재.

## 2. 자동 대조 게이트 (`tests/contrastListening.test.mjs`)

- 두 세션의 **tonic 동일**(통제 확인) + A=ionian, B=phrygian.
- B.chordColor = sus4 (revert 지배 규칙).
- B.tensionScore ≥ A.tensionScore + 0.15 / A.resolutionScore ≥ B + 0.1.
- A의 peakResolution 이벤트 = merge, B는 merge 부재.
- 기존 정량 하니스(스케일·그리드·밀도·도약)가 두 픽스처에 자동 적용됨
  (골든 팩 엔트리로 편입되므로).

## 3. 블라인드 청취 프로토콜 (`docs/maestro-player/ab-listening-protocol.md`)

평가자에게 A/B 라벨을 숨기고 두 데모를 무작위 순서로 들려준 뒤 3문항
(어느 쪽이 안정적/완결적/다시 듣고 싶은가)을 수집하는 절차. n≥3이면
과반 일치로 가설 지지 여부를 기록.

## 4. 영향

골든 팩 3→5 엔트리 (기존 개수 단언 테스트 갱신). UI는 카드 2장 추가
(다이어트로 컴팩트 카드라 부담 없음).
