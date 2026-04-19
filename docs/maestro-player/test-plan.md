# Maestro Player Test Plan

## 1. 테스트 원칙

- `Maestro Player`는 read-only여야 한다.
- 게임 실패보다 데이터 변환 오류를 먼저 막아야 한다.
- 실제 Git 변경 명령은 어떤 테스트에서도 호출되면 안 된다.

## 2. 핵심 검증 축

### A. Source Adapter

검증 대상:

- Git log를 `ReplayEvent`로 변환
- local repo bridge가 브라우저 안전한 `ReplayEvent` payload를 주입하는지 검증
- Maestro history를 `ReplayEvent`로 변환
- 공개 퍼블릭 레포 URL을 replay source로 변환
- 연결된 계정의 레포 선택 결과를 replay source로 변환
- GitHub/GitLab collaboration overlay를 `ReplayEvent`로 변환
- 필수 필드 누락 시 안전하게 실패

성공 기준:

- 같은 입력에서 항상 같은 이벤트 순서가 나온다.
- `commitSha`, `timestamp`, `eventType`가 안정적으로 채워진다.
- public repo URL만으로도 최소 1개 replay source를 만들 수 있다.
- 계정 연결 모드에서 repo/project별 선택 결과가 source registry에 안정적으로 반영된다.
- GitHub/GitLab provider를 바꿔도 replay source shape가 안정적으로 유지된다.
- local bridge가 없어도 안전하게 실패하고, 있으면 deterministic payload를 준다.
- collaboration overlay가 있으면 review 이벤트가 branch 기준으로 안정적으로 정렬된다.

### B. Chart Mapper

검증 대상:

- 이벤트를 lane/beat/noteType으로 매핑
- 과밀한 이벤트를 난이도별로 정규화

성공 기준:

- lane index가 항상 범위 안에 있다.
- beat offset이 역전되지 않는다.
- note 밀도가 난이도 규칙을 넘지 않는다.

### C. Music Mapping

검증 대상:

- 같은 branch/PR이 항상 같은 motif를 낳는지
- `merge`가 종결 패턴으로 귀결되는지
- `review-request-changes`가 긴장 패턴으로 반영되는지
- overlay 이벤트가 없을 때도 Git-only 곡이 성립하는지

성공 기준:

- 같은 입력에서 motif, key, tempo, structural role이 결정적으로 동일하다.
- `merge`는 accent lane 또는 cadence pattern으로 수렴한다.
- 이벤트 폭주 구간에서도 density cap이 유지된다.

### D. UI Shell

검증 대상:

- source 선택
- public repo URL 등록
- connected account repo 선택
- provider 전환 (`GitHub` / `GitLab`)
- chart load
- local bridge replay load
- play/pause/retry
- manual lane input
- lane/note visualization
- click track / beat sync feedback
- chart-driven BGM cue playback
- score/combo/result 화면
- `perfect/great/good/miss` judgment tier
- local score history persistence

성공 기준:

- 샘플 차트 1개 이상을 끊김 없이 재생 가능
- manual lane input으로 기본 판정과 combo 증가를 확인할 수 있다.
- beat sync UI가 현재 박자와 함께 갱신된다.
- 차트 cue가 BGM layer 상태와 함께 재생 루프에 반영된다.
- 판정 tier가 timing distance에 따라 안정적으로 갈린다.
- 공개 레포 URL 등록 후 chart 생성 흐름이 직관적이다.
- 플레이 종료 후 결과 화면이 표시됨
- 플레이 종료 후 최근 score history가 다시 표시됨

### E. Safety Guard

검증 대상:

- `git merge`, `git push`, `git reset` 등 write 명령이 호출되지 않음

성공 기준:

- 앱/테스트/adapter 어디에서도 write command path가 없음

## 3. MVP 최소 테스트 세트

1. `gitReplayAdapter` 단위 테스트
2. `localRepoBridge` 단위 테스트
3. `publicRepoAdapter` 단위 테스트
4. `collaborationOverlayAdapter` 단위 테스트
5. `chartMapper` 단위 테스트
6. `App` UI smoke 테스트
7. 샘플 Git history로 replay smoke 테스트
8. 공개 레포 URL replay smoke 테스트

## 4. 수동 확인 항목

- 레포 선택 후 chart 생성이 직관적인가
- note 밀도가 과도하지 않은가
- 악보뷰가 플레이 결과를 이해하는 데 도움이 되는가
- 사용자가 이 앱을 실제 업무 도구로 오해하지 않는가

## 5. 릴리즈 전 최소 통과 기준

- unit test green
- UI smoke green
- read-only guard 확인
- 샘플 replay 1개 이상 데모 가능
