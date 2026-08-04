# Maestro Player Music Mapping Spec

## 1. 목적

`Maestro Player`의 핵심은 Git/협업 이력을 그대로 소리로 읽어주는 것이 아니라,
개발 흐름을 음악적으로 "번역"하는 것이다.

좋은 매핑 규칙은 아래 5가지를 동시에 만족해야 한다.

- 같은 이력은 항상 같은 곡으로 재생되어야 한다.
- `merge`와 `approval` 같은 중요한 사건은 귀로도 분명히 구분되어야 한다.
- 커밋이 많아도 플레이 불가능한 노트 폭주로 무너지면 안 된다.
- 같은 브랜치나 PR은 같은 테마로 들려야 한다.
- 입력 소스가 일부 비어 있어도 곡 전체 구조는 유지되어야 한다.

## 2. 전제

`commit`과 `merge`는 Git 이력만으로 안정적으로 읽을 수 있다.
하지만 `PR`, `push`, `pull`, `review`는 Git 자체가 아니라 협업/활동 레이어다.

즉, `Maestro Player`는 입력을 2개 층으로 다뤄야 한다.

### A. Git Core Layer

- `commit`
- `merge`
- `revert`
- 브랜치별 commit burst

### B. Collaboration Overlay Layer

- `push`
- `pull` 또는 `sync`
- `pr-open`
- `pr-update`
- `review-comment`
- `review-request-changes`
- `review-resolve`
- `review-reopen`
- `review-approve`

원칙:

- Git Core Layer만 있어도 곡은 만들어져야 한다.
- Collaboration Overlay Layer가 있으면 곡 구조와 감정선이 더 풍부해진다.
- 없는 이벤트를 추측해서 만들지 않는다.
- `push`와 `pull`은 Git log만으로 복원되지 않으므로, GitHub export/API 또는 별도 activity log가 있어야 한다.

## 3. 작곡 파이프라인

`Maestro Player`의 핵심 파이프라인은 아래 순서로 고정한다.

1. `Source Adapter`
   Git, GitHub, Maestro history에서 원시 이벤트를 읽는다.
2. `Event Normalizer`
   이벤트를 공통 `ReplayEvent` 포맷으로 정규화한다.
3. `Sessionizer`
   브랜치, PR, 시간 간격 기준으로 이벤트를 하나의 연주 세션으로 묶는다.
4. `Metric Extractor`
   이벤트 크기, 긴장도, 밀도, 반복성 같은 음악용 지표를 계산한다.
5. `Music Intent Mapper`
   이벤트를 직접 음표로 바꾸지 않고, 먼저 음악 의도로 바꾼다.
6. `Composer`
   음악 의도를 멜로디, 리듬, 화성, 악센트로 변환한다.
7. `Chart Mapper`
   생성된 타임라인을 리듬게임 노트와 시각 패턴으로 내린다.

핵심 규칙:

- `ReplayEvent -> MusicIntent -> ReplayNote`
- 직접 `ReplayEvent -> ReplayNote`로 가면 의미 없는 기계음이 되기 쉽다.

## 4. 세션과 곡 구조

곡의 기본 단위는 "개별 commit"이 아니라 "브랜치 또는 PR 흐름"이다.

권장 구조:

- 1개 feature branch 또는 1개 PR = 1곡 또는 1개 메인 섹션
- 그 안의 commit burst = phrase
- review loop = bridge 또는 tension section
- approval = cadence preparation
- merge = resolution

세션 경계 규칙:

- 같은 브랜치에서 30분 이상 공백이 나면 새 phrase로 분리한다.
- 다른 브랜치로 넘어가면 새 section으로 분리한다.
- PR 번호가 같으면 branch가 바뀌어도 같은 곡 집합으로 유지할 수 있다.

## 5. 핵심 중간 모델: `MusicIntent`

`MusicIntent`는 작곡 규칙의 중심 모델이다.

권장 필드:

- `intentId`
- `eventRef`
- `structuralRole`: `intro` | `verse` | `build` | `bridge` | `cadence` | `outro`
- `motifId`
- `energy`: 0.0 ~ 1.0
- `tension`: 0.0 ~ 1.0
- `brightness`: 0.0 ~ 1.0
- `density`: 0.0 ~ 1.0
- `accentLevel`: 0.0 ~ 1.0
- `registerBand`: `low` | `mid` | `high`
- `harmonyAction`: `establish` | `repeat` | `deviate` | `suspend` | `resolve`
- `rhythmPattern`: `steady` | `staccato` | `syncopated` | `hold` | `fill`
- `orchestrationHint`: `lead` | `pad` | `bass` | `drum` | `fx`
- `laneBias`

## 6. 지표 추출 규칙

이벤트마다 아래 지표를 먼저 계산한다.

### A. `sizeScore`

변경 규모.

입력:

- `filesChanged`
- `linesAdded`
- `linesDeleted`
- `commitBurstSize`

권장 계산:

```text
rawSize =
  filesChanged * 0.6 +
  linesAdded * 0.015 +
  linesDeleted * 0.02 +
  commitBurstSize * 1.2

sizeScore = clamp(log2(rawSize + 1) / 6, 0, 1)
```

### B. `noveltyScore`

새로운 시도가 얼마나 많은지.

입력:

- `newFileCount`
- `newDirectoryCount`
- `branchAge`

권장 계산:

```text
noveltyScore =
  clamp(
    newFileCount / max(filesChanged, 1) * 0.7 +
    newDirectoryCount * 0.15,
    0,
    1
  )
```

### C. `tensionScore`

불안정, 충돌, 재작업 신호.

입력:

- `review-request-changes` 여부
- `review-reopen` 여부
- `revert` 여부
- 삭제 비율
- 짧은 시간 안의 반복 수정

권장 계산:

```text
tensionScore =
  clamp(
    requestChangesFlag * 0.45 +
    revertFlag * 0.35 +
    deleteRatio * 0.2 +
    reworkBurstScore * 0.25,
    0,
    1
  )
```

### D. `resolutionScore`

안정과 종결 신호.

입력:

- `review-approve`
- `review-resolve`
- `merge`
- `successful-checks` 같은 선택적 협업 신호

권장 계산:

```text
resolutionScore =
  clamp(
    approveFlag * 0.45 +
    mergeFlag * 0.8 +
    checksPassedScore * 0.15,
    0,
    1
  )
```

### E. `activityScore`

얼마나 바쁘게 몰아쳤는지.

입력:

- 최근 20분 이벤트 수
- 같은 author/branch의 연속 commit

권장 계산:

```text
activityScore = clamp(log2(eventsInRecentWindow + 1) / 4, 0, 1)
```

## 7. 이벤트 분류 규칙

commit 메시지와 메타데이터를 먼저 분류해야 한다.

권장 commit class:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `merge`
- `revert`

판별 순서:

1. 명시 prefix 우선
   `feat:`, `fix:`, `refactor:`, `docs:` 등
2. merge/revert 같은 Git 구조 이벤트 우선
3. 파일 경로 힌트
   `docs/`, `test/`, `spec/`, `ci/`
4. 분류 실패 시 `chore`

## 8. 음악 의도 매핑 규칙

### 공통 원칙

- `branchName` 또는 `prNumber`는 `motifId`의 핵심 키다.
- 같은 브랜치/PR이면 같은 테마가 반복되어야 한다.
- `author`는 멜로디 자체보다 음색, 옥타브, 보조 리듬에 반영하는 편이 안정적이다.

### 이벤트별 기본 역할

#### `commit`

- 곡의 기본 멜로디 재료
- `sizeScore`가 크면 note 수와 sustain이 증가
- `activityScore`가 높으면 리듬이 촘촘해짐

#### `push`

- 전환 신호
- 메인 멜로디가 아니라 짧은 상승 fill 또는 드럼 roll
- section 전환 직전의 pickup으로 쓰기 좋음

#### `pull` / `sync`

- 정렬과 재앵커링 신호
- 짧은 휴지 뒤에 루트음 또는 베이스 리셋
- 과장된 멜로디보다는 리듬 정렬 효과가 적합

#### `pr-open`

- 테마 공식 제시
- 새 section 시작
- chord pad + main motif entry

#### `review-comment`

- 장식음
- 본 멜로디를 깨지 않는 짧은 ghost note 또는 off-beat hit

#### `review-request-changes`

- 가장 명확한 긴장 신호
- 일시적 불협, syncopation, 하행 패턴, 짧은 break 사용

#### `review-resolve`

- discussion thread가 해소된 상태
- `review-approve`보다 약하지만 분명한 cadence/resolve 신호

#### `review-reopen`

- 한 번 풀렸던 긴장이 다시 열린 상태
- `review-request-changes`보다 짧고 날카로운 재긴장으로 다룬다.

#### `review-approve`

- 안정 회복
- dominant 성격의 상승 패턴, cadence 준비

#### `merge`

- 가장 강한 종결 신호
- tonic resolve, 긴 hold, accent chord, crash 성격의 타격

#### `revert`

- 하행 패턴 + 긴장 회복 또는 공백
- 이미 제시된 motif의 역행 또는 축소형이 잘 맞음

## 9. 화성 규칙

화성은 repo 전체의 정체성을 유지해야 한다.

권장 규칙:

- `repoId` 해시로 기본 조성 결정
- `branchName` 해시로 motif seed 결정
- `commit class`로 mode와 chord color 결정

권장 모드 매핑:

- `feat` -> Ionian 또는 Mixolydian
- `fix` -> Dorian
- `refactor` -> Aeolian 기반 반복형
- `docs` -> Lydian 또는 major pentatonic
- `test` -> minor pentatonic + percussive
- `chore` -> neutral triad 중심
- `review-request-changes` -> sus2, sus4, flat7 등 미해결 성격
- `merge` -> tonic triad 또는 add9 resolve

## 10. 리듬 규칙

### 기본 템포

템포는 레포 성격과 최근 활동 밀도의 합으로 정한다.

권장 계산:

```text
baseTempo = 92 + repoComplexityClass * 6
tempoBoost = round(activityScore * 18)
tempo = clamp(baseTempo + tempoBoost, 88, 142)
```

### 이벤트 길이

권장 규칙:

- 작은 commit: 0.5 beat ~ 1 beat
- 중간 commit: 1 beat ~ 2 beats
- 큰 commit: 2 beats ~ 4 beats
- merge/accent: 최소 2 beats hold 보장

### 침묵 규칙

- 15분 이상 이벤트 공백은 그대로 휴지로 반영하거나 section break로 승격
- 모든 공백을 note로 채우지 않는다

## 11. 레인 매핑 규칙

레인은 단순 랜덤이 아니라 의미를 가져야 한다.

### 4레인 기본 권장

- Lane 1: 기반 작업
  `docs`, `chore`, `test`, low rhythm
- Lane 2: feature melody
  `feat`, primary phrase
- Lane 3: tension lane
  `fix`, `refactor`, `review-request-changes`
- Lane 4: accent lane
  `approval`, `merge`, strong cadence

### 6레인 확장 권장

- Lane 1: docs/test
- Lane 2: frontend/app
- Lane 3: backend/core
- Lane 4: refactor/review tension
- Lane 5: approvals/fills
- Lane 6: merge/cadence accent

최종 lane 선택 규칙:

1. 특수 이벤트는 예약 lane 우선
2. 일반 commit은 `dominantPathGroup` + `motifId` 해시로 lane 선택
3. 같은 phrase 안에서 lane 점프는 2칸 이내를 우선
4. merge 직전에는 accent lane으로 수렴

## 12. 난이도 정규화 규칙

난이도는 음악 구조를 바꾸지 않고 표현 밀도만 줄여야 한다.

### Easy

- phrase당 핵심 note만 유지
- review ornament 제거
- hold 위주

### Normal

- 기본 모티프 유지
- push/fill 반영
- review ornament 일부 반영

### Hard

- syncopation 유지
- commit burst subdivision 반영
- tension lane의 교차 패턴 허용

상한 규칙:

- 초당 발음 노트 수 cap 필요
- merge 직전 2초 구간은 readability를 위해 simultaneous note 수를 제한

## 13. 결정적 규칙

랜덤처럼 들리되 실제로는 deterministic해야 한다.

필수 seed:

- `repoSeed = hash(repoId)`
- `branchSeed = hash(branchName || prNumber)`
- `eventSeed = hash(eventId)`

규칙:

- motif 선택은 `branchSeed`
- ornament variation은 `eventSeed`
- 템포와 key는 세션 전체에서 고정 또는 section 단위로만 변화

## 14. v1 구현 우선순위

v1은 아래까지만 먼저 고정한다.

1. `commit`
2. `merge`
3. `revert`
4. `pr-open`
5. `review-request-changes`
6. `review-approve`
7. `push`

`pull`은 Git-only 환경에서 안정적으로 얻기 어렵기 때문에
overlay source가 있을 때만 반영한다.

## 15. v1 권장 의사코드

```text
events = loadReplayEvents(source)
normalized = normalizeEvents(events)
sessions = sessionize(normalized)

for session in sessions:
  repoSeed = hash(session.repoId)
  branchSeed = hash(session.branchName or session.prNumber)
  tempo = pickTempo(session, repoSeed)
  key = pickKey(session, repoSeed)
  motif = pickMotif(branchSeed)

  for event in session.events:
    metrics = extractMetrics(event, session)
    intent = mapEventToMusicIntent(event, metrics, motif)
    phrase = composePhrase(intent, key, tempo)
    notes = mapPhraseToChartNotes(phrase, session.laneCount)
    emit(notes)
```

## 16. 검증 기준

알고리즘은 아래 질문에 "예"가 나와야 한다.

- 같은 branch를 두 번 렌더링하면 같은 핵심 테마가 들리는가
- merge가 항상 종결처럼 들리는가
- review-request-changes가 긴장으로 느껴지는가
- approval이 merge 직전 안정 신호로 들리는가
- 이벤트가 많은 날에도 플레이 가능한 밀도를 유지하는가
- overlay 이벤트가 없어도 Git-only 곡이 성립하는가
