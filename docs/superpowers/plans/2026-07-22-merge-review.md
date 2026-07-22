# 머지 승인 리뷰 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인 전에 git 원본 기반 리뷰(diff·커밋·충돌 사전검사)를 제공하고, 리뷰 시트에서 바로 승인/반려한다.

**Architecture:** 서버에 `reviewOps` + `GET /api/requests/:id/review`(HTTP 지연 로드, WS 무변경). 대시보드는 `useMergeReview` 훅이 데이터를 받아 PreviewModal(리뷰 시트로 확장)에 공급. App은 `performNoteAction(targetNote)` 코어를 분리해 시트가 열람한 정확한 노트를 승인/반려한다. 서버 데이터 불가 시 diffSummary 폴백.

**Tech Stack:** node:test + 실제 git 픽스처, vitest+RTL, playwright(하네스를 http+WSS 결합으로 승격).

## Global Constraints

- 기존 승인/반려/롤백·채점·Mock 모드 불변. `npm run qa` + e2e 전체 통과 유지, e2e 동시 갱신.
- WS 프로토콜 무변경. 인증은 기존 `isRequestAuthorized` 재사용.
- 상한: 파일 50 / 패치 32KB / 커밋 50. base = 저장소 현재 HEAD 브랜치.
- 스펙: `docs/superpowers/specs/2026-07-22-merge-review-design.md`

---

### Task 1: 서버 reviewOps + `/api/requests/:id/review` (TDD, 실제 git 픽스처)

**Files:** Modify `maestro-server.js`, `tests/server-regression.test.mjs`(픽스처 헬퍼 + 신규 테스트)

**Interfaces (Produces):** 스펙 §2.1 응답 스키마 그대로. 404 REQUEST_NOT_FOUND / 409 BRANCH_NOT_FOUND / 500 REVIEW_FAILED.

- [ ] 실패 테스트: tmpdir 픽스처 레포(베이스 커밋 + `feature/clean`(2파일 수정) + `feature/conflict`(동일 라인 충돌)) 생성 헬퍼 → 서버를 `MAIN_REPO_PATH=픽스처`로 스폰 → POST /api/request 후 GET review: 클린(mergeable=true, files/stats/commits), 충돌(mergeable=false + conflictFiles), 미존재 404, 브랜치 삭제 409, SERVER_TOKEN 시 무토큰 401
- [ ] `node --test tests/server-regression.test.mjs` FAIL 확인 → reviewOps 구현(rev-parse HEAD/verify, log %h␟%s␟%an␟%aI, numstat+name-status, 파일별 diff 상한, merge-tree --write-tree --name-only exit 0/1 파싱) + 라우트 추가 → PASS
- [ ] `npm run test:server` 전체 PASS → Commit `feat(server): add merge review API with conflict pre-check`

### Task 2: App `performNoteAction` 코어 분리 (+RejectSheet noteId)

**Files:** Modify `src/App.jsx`

**Interfaces:** `performNoteAction(targetNote, { isRejectAction, promptFeedback, rejectFeedback })` — 채점/전송/피드백 로직 이동. `triggerLaneAction`은 노트 선택만. rejectSheet state에 `noteId` 추가, confirm 시 noteId 우선 해석.

- [ ] 리팩터 후 기존 UI 테스트 전체(`npm run test:ui`)가 그대로 PASS (동작 불변 증명) → Commit `refactor(app): extract performNoteAction targeting an exact note`

### Task 3: `useMergeReview` + `toHttpUrl` + PreviewModal 리뷰 시트 + UI 테스트 (TDD)

**Files:** Create `src/hooks/useMergeReview.js`, `src/App.merge-review.ui.test.jsx` / Modify `src/utils/server-address.js`(+`toHttpUrl`), `src/utils/server-address.test.js`, `src/components/maestro/PreviewModal.jsx`, `src/App.jsx`(wiring)

**Interfaces:** `useMergeReview({ wsUrl }) => { review, isReviewLoading, reviewError, loadReview(requestId), clearReview }`. PreviewModal 신규 props: `review, isReviewLoading, reviewError, onApprove, onReject`. 접근성: 승인 버튼 `리뷰 승인`, 반려 버튼 `리뷰 반려`, 배지 `data-testid="review-merge-badge"`, 폴백 `data-testid="review-fallback"`.

- [ ] 실패 테스트: ① `toHttpUrl('ws://h:8080','/x')==='http://h:8080/x'`(wss→https 포함) ② 노트 클릭 → 모킹 fetch 리뷰 렌더(파일 경로, +41/−3, `머지 가능` 배지, 커밋 subject) ③ `리뷰 승인` 클릭 → MockWebSocket sent에 정확한 requestId APPROVE ④ `리뷰 반려` → RejectSheet 열림 → 확정 시 해당 노트 REJECT ⑤ fetch 실패 → `review-fallback` + diffSummary ⑥ requestId 없는 노트 → fetch 미호출
- [ ] 구현 → 신규+전체 `npm run test:ui` PASS → Commit `feat(review): merge review sheet with real diff and in-sheet decision`

### Task 4: e2e 하네스 승격 + 리뷰 시나리오

**Files:** Modify `tests/e2e/maestro.e2e.spec.js`(http.createServer + WSS attach, `/api/requests/:id/review` 픽스처 라우트, 신규 테스트)

- [ ] 신규 테스트: AGENT_TASK_READY → 노트 클릭 → 리뷰 시트(파일 경로·배지) → `리뷰 승인` → receivedActions에 APPROVE(requestId 일치). 기존 시나리오 전부 유지
- [ ] `npm run test:e2e` PASS → Commit `test(e2e): cover merge review sheet flow`

### Task 5: 문서 + 최종 검증 + PR

- [ ] USER_GUIDE에 리뷰 시트 사용법(노트 탭 → 리뷰 → 시트 내 승인/반려, 충돌 배지 의미) 추가
- [ ] `npm run qa` && `npm run test:e2e` PASS → Commit → PR → CI 확인

## Self-Review 결과
- 스펙 §2→T1, §3.3→T2, §3.1/3.2→T3, §4 e2e→T4, 문서→T5. 갭 없음. 시트 승인 채점 유지(스펙 §6-4)는 T2 코어 재사용으로 충족.
