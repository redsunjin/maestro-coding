# Maestro Player Music Validation Plan

## 1. 목적

`Maestro Player`에서 "음악적 검증"은
절대적인 미적 우열을 기계가 판정하는 일이 아니다.

대신 아래 질문에 안정적으로 답하는 체계를 만드는 것이다.

- 같은 이력이 다시 재생되면 같은 음악적 정체성이 유지되는가
- `request changes -> resolve -> approve -> merge`가 귀로도 다른 역할로 들리는가
- `push`, `pull`, `sync`가 전환 신호로만 쓰이고 멜로디를 과하게 점유하지 않는가
- 이벤트가 많아져도 차트와 오디오가 과밀해지지 않는가

즉, 이 프로젝트의 음악 검증은
`좋은 음악인가`를 직접 판정하는 대신
`좋다고 정한 번역 규칙이 유지되는가`를 검증해야 한다.

## 2. 검증 계층

### A. 의미 계약 검증

가장 먼저 깨지면 안 되는 층이다.

검증 항목:

- `review-request-changes`는 긴장 구간이어야 한다
- `review-resolve`와 `review-approve`는 해소 구간이어야 한다
- `merge`는 종결이어야 한다
- `push`는 fill/drum 성격이어야 한다
- `pull` / `sync`는 재정렬/정돈 성격이어야 한다

자동화 방식:

- `MusicIntent` 필드 직접 검증
- `structuralRole`, `rhythmPattern`, `harmonyAction`, `accentLevel`, `tension` 비교

이 층은 이미 일부 존재하며, 앞으로도 가장 빠른 regression gate로 유지한다.

### B. 음악적 fingerprint 검증

이 층이 현재 가장 중요하다.

고정 fixture 하나에서 아래 요약치를 추출해 비교한다.

- motif id
- key / tempo
- role sequence
- rhythm pattern sequence
- harmony action sequence
- peak tension event
- peak resolution event
- event별 note footprint
- cue batch 수와 accent 비율

핵심은 raw snapshot을 크게 저장하는 것이 아니라,
귀로 들리는 구조를 대표하는 작은 fingerprint를 고정하는 것이다.

예:

- 긴장 최고점은 항상 `review-request-changes` 또는 `review-reopen`
- 종결 최고점은 항상 `merge`
- `push`는 `fill`이어야 하고 `merge`보다 accent dominance가 낮아야 한다

### C. 차트/오디오 번역 검증

`MusicIntent`만 맞고 chart/cue로 내릴 때 의미가 사라지면 안 된다.

검증 항목:

- `merge` note는 accent lane으로 수렴하는가
- `push` note는 짧은 fill footprint로 끝나는가
- `sync`는 steady/재정렬 cue로 유지되는가
- cue batch가 event 흐름을 과도하게 압축하지 않는가

자동화 방식:

- `ChartNote.eventRef` 기준 집계
- cue batch 수, accent 수, hold 수, lane spread 비교

### D. 청취 검증

자동화만으로는 부족하다.
릴리즈 전에는 사람이 실제로 들어봐야 한다.

권장 절차:

1. 고정 fixture 3~5개를 golden listening set으로 둔다
2. 각 fixture를 autoplay로 렌더한다
3. 아래 rubric으로 1~5점 평가한다

rubric:

- theme identity
  같은 브랜치/PR이 같은 테마로 느껴지는가
- tension / release
  수정 요청, 해결, 승인, 머지가 귀로 구분되는가
- transition clarity
  `push` / `pull` / `sync`가 전환 효과처럼 들리는가
- density readability
  정보량이 많아도 답답하지 않고 읽히는가
- replay memorability
  한 번 들은 뒤 다시 들어도 곡의 흐름이 기억되는가

고정 청취 세트 정의:

- `docs/maestro-player/golden-listening-set.md`
- `player/scripts/exportGoldenListeningPack.mjs`

## 3. 권장 실행 루프

### Step 1. 규칙 변경

- `music-mapping-spec.md`를 먼저 수정한다

### Step 2. 의미 테스트

- `musicIntentMapper.test.mjs`
- `musicValidationHarness.test.mjs`

### Step 3. 차트/오디오 테스트

- `chartMapper.test.mjs`
- `replayAudioEngine.test.mjs`

### Step 4. QA

- `cd player && npm run qa`

### Step 5. 청취 세트 확인

- golden listening set을 autoplay로 들어본다
- rubric 5개 중 1개라도 크게 무너지면 규칙을 되돌리거나 보정한다

### Step 6. 청취 팩 갱신

- `cd player && npm run listening:pack`
- 생성된 `manifest.json`과 `listening-pack.md`로 fixture 요약을 검토한다

## 4. 좋은 음악 검증의 기준

`Maestro Player`에서 좋은 음악 검증은 아래 4가지를 만족해야 한다.

1. deterministic
   같은 이력은 같은 곡으로 재생된다
2. contrastive
   긴장과 해소가 서로 다르게 들린다
3. playable
   차트 밀도와 cue 수가 과하지 않다
4. memorable
   같은 브랜치/PR의 테마가 반복적으로 인지된다

## 5. 지금 바로 자동화할 기준

현재 브랜치에서 최소한 아래는 자동화해야 한다.

- fixture fingerprint의 결정성
- `push` / `sync` / `review-request-changes` / `review-resolve` / `merge`의 역할 차이
- `merge`의 accent dominance
- `push`의 fill footprint
- cue plan이 동일 입력에서 동일하게 생성되는지

이 기준을 통과하지 못하면,
알고리즘이 "작곡"보다 "로그 낭독" 쪽으로 흔들리기 시작한 것으로 본다.
