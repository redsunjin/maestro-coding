# Maestro Player G2 — 공개 리플레이 하드닝 설계 (오류 분류 + 재시도 + 저장 정책)

- 날짜: 2026-08-04
- 상태: 확정 (로드맵 G2 범위, 사용자 브레인스토밍 승인)
- 범위: `player/` 하위만

## 0. 사용자 확정값

- 오류 UX: **분류형 메시지 + 전역 배너 '다시 시도' 버튼** (자동 재시도 없음).
- 저장 정책: **점수 기록 소스별 최근 50건 상한**(초과 시 오래된 순 삭제),
  launch 세션은 마지막 1건 유지(현행 유지 + 테스트로 고정).

## 1. 오류 분류 (public 리플레이 로드 경로)

`publicRepoAdapter`의 throw 지점에 `code`를 부여하고, fetch 네트워크 예외를
감싸 분류한다. 계정/로컬 모드는 기존 일반 메시지 유지(비범위).

| code | 조건 | 사용자 문구 방향 (ko/en, copy `errors.publicLoad.*`) |
| --- | --- | --- |
| `INVALID_URL` | URL 파싱 실패, owner/repo 누락 | URL 형식 안내 |
| `UNSUPPORTED_HOST` | github/gitlab 외 호스트 | 지원 호스트 안내 |
| `RATE_LIMITED` | 응답 403/429 | 요청 한도 — 잠시 후 재시도 안내 |
| `NOT_FOUND` | 응답 404 | 저장소/브랜치 확인 안내 |
| `API_ERROR` | 그 외 비정상 응답 | forge 응답 오류 + 상태코드 |
| `NETWORK` | fetch 예외(TypeError 등) | 네트워크 연결 안내 |
| `EMPTY_HISTORY` | 로드 성공했으나 이벤트 0건 | 브랜치에 재생할 이력 없음 안내 |

- App은 `error.code`를 copy 키로 매핑해 **전역 배너**에 표시하고, 배너에
  `다시 시도` 버튼을 붙인다(마지막 로드 시도를 그대로 재실행 — 모든 소스
  모드의 handleLoadReplay 재호출).
- 코드 미부여 오류는 기존 `loadReplayFailed` 문구로 폴백.
- **EMPTY_HISTORY는 플레이 탭 자동 전환을 하지 않는다** (노트 0 차트로
  점프하는 것 방지). 세션 데이터는 기록하되 소스 탭에 머문다.

## 2. 저장 정책

- `performanceHistoryStore`: 전역 18건 상한 → **sourceKey별 50건**으로 변경,
  각 소스에서 오래된 순 삭제. 전체 안전 상한 200건(오래된 순) 추가.
- 확장 launch 세션(`extension/lib/session.js`): 마지막 1건만 저장하는 현행
  정책을 테스트로 고정하고 README에 명시.

## 3. 테스트

- `tests/publicRepoAdapter.test.mjs` 확장: 403→RATE_LIMITED, 404→NOT_FOUND,
  기타 5xx→API_ERROR, fetch 예외→NETWORK, 잘못된 URL→INVALID_URL/UNSUPPORTED_HOST.
- `tests/performanceHistoryStore.test.mjs` 확장: 소스별 50건 초과 시 해당
  소스의 가장 오래된 기록 삭제, 다른 소스 기록 유지, 전체 200건 상한.
- `App.ui.test.jsx` 추가: ① 403 응답 → rate-limit 문구 배너 + 재시도 버튼,
  재시도 성공 시 배너 소멸+플레이 탭 전환. ② 이벤트 0건 → EMPTY_HISTORY
  배너 + 소스 탭 유지.
- 회귀: `npm run qa` + `build:extension`, g1 하니스 재실행(GitHub/GitLab 실로드).

## 4. 비범위

- 자동 재시도/백오프, 계정·로컬 모드 오류 분류, 골든 청취 rubric(수동),
  Web Store 준비(G3).
