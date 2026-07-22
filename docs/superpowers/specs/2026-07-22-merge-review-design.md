# 머지 승인 리뷰 보강 — 실제 diff 기반 리뷰 시트

- 날짜: 2026-07-22
- 상태: 구현 진행
- 배경: 승인 버튼은 실제 `git merge`를 실행하는데, 승인자가 보는 정보는 에이전트가 자가 보고한 `diffSummary`(제목+한 줄)뿐이다. 서버가 저장소를 직접 갖고 있으므로 **git 원본에서 진실(diff·커밋·충돌 여부)을 만들어** 승인 전에 보여준다.

## 1. 목표 / 비범위

**목표**
1. 서버: 승인 요청별 **실제 리뷰 데이터 API** — 변경 파일·패치·커밋 목록·머지 가능성(충돌 사전검사).
2. 대시보드: 노트 미리보기(PreviewModal)를 **리뷰 시트**로 승격 — 실제 diff 열람 + 시트 안에서 승인/반려.
3. 서버 데이터를 못 받는 환경(Mock 모드, 구버전 서버, 인증 실패)에서는 기존 diffSummary 폴백.

**비범위 (YAGNI)**
- 신택스 하이라이트(+/− 라인 컬러링만), 리뷰 코멘트/주석, diff 페이지네이션(크기 상한+잘림 표시로 대체), CI 상태 연동.
- 요청 접수 시점의 충돌 배지 푸시(레인 노트에 표시) — 접수 지연을 만들므로 v2. 이번엔 리뷰 시트 안에서만 판정 표시.
- 서버 프로토콜(WS 이벤트) 변경 없음 — 리뷰 데이터는 HTTP 지연 로드.

**불변 조건**: 기존 승인/반려/롤백 흐름·게임 채점·Mock 모드 동작 불변. e2e 동시 갱신.

## 2. 서버 — 리뷰 API

### 2.1 엔드포인트

`GET /api/requests/:requestId/review` — 인증은 기존 `isRequestAuthorized`(SERVER_TOKEN 설정 시 Bearer 필수, 미설정 시 개방)와 동일.

응답(200):
```json
{
  "requestId": "req_x",
  "branchName": "feature/login-fix",
  "baseRef": "main",
  "mergeable": true,
  "conflictFiles": [],
  "stats": { "filesChanged": 2, "additions": 41, "deletions": 3, "truncated": false },
  "commits": [{ "sha": "abc1234", "subject": "fix: ...", "author": "name", "date": "ISO" }],
  "files": [
    { "path": "src/login.js", "status": "modified", "additions": 40, "deletions": 2, "binary": false, "patch": "@@ ...", "truncated": false }
  ],
  "generatedAt": "ISO"
}
```

에러: 요청 미존재 → 404 `{ error: 'REQUEST_NOT_FOUND' }`, 브랜치 소실(이미 머지/삭제) → 409 `{ error: 'BRANCH_NOT_FOUND' }`, git 실패 → 500 `{ error: 'REVIEW_FAILED', message }`.

### 2.2 구현 (`reviewOps`, gitOps 옆)

`requestMetaById`/`approvalRequestsById`에서 branchName을 찾고, 활성 프로젝트 경로에서 실행:
- base: `git rev-parse --abbrev-ref HEAD` (merge가 현재 HEAD에 수행되므로 base=HEAD가 진실)
- 존재 확인: `git rev-parse --verify --quiet <branch>`
- 커밋: `git log --format=%h%x1f%s%x1f%an%x1f%aI <base>..<branch>` (최대 50)
- 파일 목록: `git diff --numstat <base>...<branch>` + `--name-status` 병합(바이너리는 numstat `-`)
- 패치: 파일별 `git diff <base>...<branch> -- <path>` — 상한: 파일 50개, 파일당 patch 32KB(초과 시 `truncated: true` + 생략), 전체 응답 목표 <1MB
- 충돌 사전검사: `git merge-tree --write-tree --name-only <base> <branch>` — exit 0 = mergeable, exit 1 = 충돌(+출력에서 충돌 파일 파싱). 실패/미지원 시 `mergeable: null`(판정 불가로 표시)

캐시 없음(요청 시 계산). 모든 git 호출은 기존 `execFilePromise` 사용.

## 3. 대시보드 — 리뷰 시트

### 3.1 데이터 훅 `useMergeReview({ wsUrl })`

`{ review, isReviewLoading, reviewError, loadReview(requestId), clearReview }`. ws→http 변환은 `server-address.js`에 `toHttpUrl(wsUrl, path)` 공용 헬퍼 신설(기존 5개 훅의 사설 `toApiUrl`은 손대지 않음 — blast radius 최소화). `requestId`가 없는 노트(Mock 노트)는 fetch 없이 즉시 폴백.

### 3.2 PreviewModal → 리뷰 시트 확장 (컴포넌트/테스트ID 유지)

- 헤더: 제목 + 브랜치·에이전트 + **머지 판정 배지**(`머지 가능`(green) / `충돌 N개`(red) / `판정 불가`(gray))
- 요약 스트립: 파일 N개 · +A/−D · 커밋 M개
- 커밋 목록(간단 리스트), 파일 섹션: 경로 + 상태 + ±수치 + 패치(기존 +/−/@@ 컬러 렌더러 재사용, 잘림 시 "…(생략)" 표시)
- 푸터: **`승인` / `반려`** 버튼 + 닫기. 반려는 기존 RejectSheet(사유 입력) 흐름으로 연결.
- 폴백 뷰: review 없음(로딩 실패·Mock) → 기존 diffSummary 표시 + "서버 리뷰 데이터를 불러올 수 없어 에이전트 요약만 표시합니다" 안내. 로딩 중 상태 표시.

### 3.3 App 연결 — 정확한 노트 대상 지정

현재 `triggerLaneAction(laneId)`은 레인의 첫 READY 노트를 대상으로 한다. 리뷰 시트에서 승인하는 노트는 **열람한 바로 그 노트**여야 하므로:
- 코어를 `performNoteAction(targetNote, options)`로 분리 — 채점/전송/피드백 로직 이동. `triggerLaneAction`은 첫 READY 노트를 골라 코어 호출(기존 시맨틱 불변).
- `RejectSheet` 상태에 `noteId`를 실어 확정 시 해당 노트를 우선 해석(소실 시 기존처럼 레인 첫 노트).
- previewNote 설정 시 `loadReview(previewNote.requestId)`, 해제 시 `clearReview()`.
- 시트 승인/반려 시 시트를 닫고 `performNoteAction` 실행(승인 채점은 기존 규칙 그대로 적용).

## 4. 테스트 전략 (TDD)

| 레이어 | 내용 |
|---|---|
| 서버(node --test) | tmpdir에 실제 git 픽스처 레포(베이스 + 클린 브랜치 + 충돌 브랜치) 구성 후: ① 클린 → files/stats/commits/mergeable=true ② 충돌 → mergeable=false + conflictFiles ③ 미존재 요청 404 ④ 브랜치 삭제 409 ⑤ SERVER_TOKEN 설정 시 무토큰 401 |
| UI(vitest+RTL) | 신규 `App.merge-review.ui.test.jsx`: AGENT_TASK_READY 주입 → 노트 클릭 → fetch 모킹된 리뷰 렌더(파일 경로·±·배지) → `승인` 클릭 → MockWebSocket로 정확한 requestId의 APPROVE 전송 확인. fetch 실패 → 폴백 문구. Mock 노트(requestId 없음) → fetch 미호출 |
| e2e(playwright) | 하네스를 http 서버+WSS 결합으로 승격, `/api/requests/:id/review` 픽스처 제공 → 노트 클릭 → 리뷰 시트에 실제 파일/패치 표시 → 시트에서 승인 → APPROVE 수신 확인 |
| 회귀 | `npm run qa` 전체 + 기존 e2e 시나리오(키보드 승인 등) 불변 |

## 5. 리스크순 로드맵

| 순서 | 작업 | 리스크 | 이유 |
|---|---|---|---|
| 1 | 서버 reviewOps + `/review` 엔드포인트 + git 픽스처 회귀 테스트 | **고** | merge-tree 파싱·크기 상한 등 핵심 불확실성 |
| 2 | App `performNoteAction` 리팩터(+RejectSheet noteId) | 고 | 승인 코어 로직 이동 — 기존 UI 테스트 전체가 안전망 |
| 3 | `useMergeReview` + `toHttpUrl` + PreviewModal 리뷰 시트 + UI 테스트 | 중 | 신규 표면 |
| 4 | e2e 하네스 승격 + 리뷰 시나리오 | 중 | 회귀 안전망 |
| 5 | 문서(USER_GUIDE 리뷰 흐름) | 저 | |

## 6. 자율 진행 중 내린 결정 (사용자 확인 포인트)

1. 리뷰 데이터는 HTTP 지연 로드(WS 이벤트 무변경) — 대형 diff로부터 실시간 채널 보호.
2. base는 `main` 고정이 아니라 **저장소의 현재 HEAD 브랜치** — 실제 머지 대상과 일치.
3. 노트 접수 시점 충돌 배지는 v2로 미룸(접수 지연 방지). 리뷰 시트 안에서만 판정 표시.
4. 시트 승인도 기존 타이밍 채점 규칙을 그대로 태움(점수 전용, 머지에 영향 없음 — 기존 원칙 유지).
5. 상한: 파일 50개 / 패치 32KB/파일 / 커밋 50개 — 초과분은 잘림 표시.
