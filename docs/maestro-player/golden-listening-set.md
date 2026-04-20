# Maestro Player Golden Listening Set

## 목적

이 문서는 `Maestro Player`의 청취 검증 기준 세트를 고정한다.

자동 테스트만으로는
`정말 음악적으로 납득되는가`
를 끝까지 보장할 수 없다.

그래서 아래 3개 시나리오를 골든 세트로 유지한다.

## 시나리오

### 1. GitHub Public PR Cadence

소스:

- `https://github.com/openai/maestro-player/tree/feature/cadence`

집중해서 들을 것:

- feature intro motif가 빠르게 정체성을 만드는가
- request-changes가 가장 선명한 긴장 피크로 들리는가
- approval과 merge가 서로 다른 해소 단계로 들리는가

### 2. GitLab Public Discussion Resolution

소스:

- `https://gitlab.com/openai/maestro-player/-/tree/feature/cadence`

집중해서 들을 것:

- reopen이 부분 해소 뒤 다시 긴장을 끌어올리는가
- discussion resolve가 merge보다 약한 해소로 들리는가
- approval이 final merge cadence를 덮지 않는가

### 3. Transition Overlay Practice

소스:

- `fixture://transition-overlay-practice`

집중해서 들을 것:

- `push`가 fill처럼 짧게 지나가는가
- `sync`가 재정렬처럼 들리고, 새 멜로디 주제처럼 튀지 않는가
- 최종 `merge`가 여전히 가장 강한 종결로 느껴지는가

## 실행 방법

autoplay 청취 팩 생성:

```bash
cd player
npm run listening:pack
```

생성 결과:

- `player/output/golden-listening-set/manifest.json`
- `player/output/golden-listening-set/listening-pack.md`

## 운영 규칙

- 알고리즘 규칙을 바꾸면 먼저 이 세트의 자동 fingerprint를 통과시킨다.
- 그 다음 autoplay 기준으로 실제로 들어본다.
- 3개 시나리오 중 1개라도 긴장/해소/전환 역할이 흐려지면 조정 전 릴리즈하지 않는다.
