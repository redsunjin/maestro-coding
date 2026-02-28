# Maestro Coding 작업계획

기준일: 2026-02-28

## 1) 현재 상태 요약

- 현재 단계: MVP (핵심 데모 흐름 동작)
- 확인된 강점
  - 대시보드 빌드/실행 경로 확보
  - `POST /api/request` -> WebSocket 브로드캐스트 흐름 동작
  - `APPROVE`/`UNDO` Git 명령 연동 동작
- 확인된 핵심 갭
  - 서버 노출 기본정책(CORS/바인딩) 강화 필요
  - 프론트엔드 승인/반려 이벤트의 엣지 케이스 검증 확대 필요
  - `REJECT` 사용자 플로우 수동 QA 시나리오 보강 필요
  - 회귀 테스트 범위를 UI/E2E까지 확장 필요

## 1-1) 진행 현황 (2026-02-28 업데이트)

- `WP-001` 완료: 토큰 인증 로직/문서 정합성 반영
- `WP-002` 완료: 승인 이벤트 처리 정합성 개선 + UI 회귀 테스트 반영
- `WP-003` 완료: 대시보드 반려 입력(`Shift + D/F/J/K`) + 피드백/취소 흐름 + UI 회귀 테스트 반영
- `WP-004` 완료: 기본 바인딩(`HOST=127.0.0.1`) + Origin 화이트리스트 CORS 반영
- `WP-005` 완료: 서버/UI/E2E + CI 게이트 + 통합 스모크(`npm run smoke:integration`) 반영
- `WP-006` 완료: `check:env` preflight + `start:app` 원클릭 런처 + 가이드 반영
- `WP-007` 진행중: 1차 모듈 분해(상수/저장소/오디오/YouTube 유틸 분리) 완료
- QA 에이전트 설정 완료: `npm run qa` + 회귀 테스트 스위트 + QA 가이드 추가
- `function bach` 1차 완료: 상단 미니 플레이어, 채널 URL 저장, 재생/일시정지/볼륨, 주파수(Hz) 시각화 반영
- 터치 입력 대응 완료: 레인 승인/반려 버튼 + 터치 롤백 버튼 + UI 회귀 테스트 반영
- 오픈 이슈 분리 추적: [`docs/KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) (`KI-001`: `function bach` Hz 미노출 환경 조사)

## 1-2) 다음 작업 포인트 (즉시 실행)

1. 컨텍스트/유지보수 최적화: `WP-007` 2차(UI 컴포넌트 분해) 진행
2. 설치 경로 운영 안정화: `start:app` 사용 데이터 기반 오류 메시지/가이드 고도화
3. 문서 최신화: 현재 상태/작업순서를 README/USER_GUIDE/WORK_PLAN에 지속 동기화

## 1-3) 즉시 실행 결과 (2026-02-28)

- 완료: `qa-gate` 워크플로 추가 (`pull_request/main`, `push/main`) + `npm run qa` 실행
- 완료: CI E2E job 추가 (`npm run test:e2e`, Playwright Chromium 설치 포함)
- 완료: E2E 최소 시나리오 추가 (`tests/e2e/maestro.e2e.spec.js`)
- 완료: 문서 동기화 (`README.md`, `USER_GUIDE.md`, `docs/QA_AGENT.md`)
- 완료: 통합 스모크 추가 (`scripts/smoke-agent-integration.sh`, `npm run smoke:integration`)
- 완료: 터치 조작 지원(승인/반려/UNDO 버튼 + UI 회귀 테스트)

## 1-4) 종합 진단 (설치/코드 최적화 관점)

- 설치/실행 경험
  - `WP-006`로 `npm run start:app` 단일 실행 경로를 제공
  - 여전히 `.env` 설정과 환경오류 대응(포트/경로) 가이드는 지속 개선 필요
- 코드/컨텍스트 규모
  - 전체 추적 파일 수: 약 30개
  - `src/App.jsx`: 1228 lines (단일 파일 집중도 높음)
  - UI 상태/이펙트 훅 수가 많아(30+), 변경 시 회귀 영향 범위가 넓음
- 런타임/번들
  - `vite build` 기준 JS 번들 약 228 kB (gzip 71 kB)로 현재 성능 병목은 크지 않음
  - 즉시 최적화 우선순위는 성능보다 구조 분해(유지보수/컨텍스트 절감)
- 결론
  - 1차는 `앱 패키징`보다 `원클릭 실행형` 자동화가 ROI가 높음
  - 병행 과제로 `App.jsx` 분해를 진행해야 이후 기능 개발 속도/품질이 안정됨

## 2) 우선순위 백로그

| ID | 우선순위 | 항목 | 변경 대상 | 완료 기준 |
|---|---|---|---|---|
| WP-001 | P1 | 토큰 인증 정합성 | `maestro-server.js`, `hooks/notify-maestro.sh`, `README.md`, `USER_GUIDE.md` | 토큰 설정 시 미인증 요청은 `401` 반환, 인증 요청만 `200` |
| WP-002 | P1 | 승인 상태 정합성 | `src/App.jsx`, `maestro-server.js` | `MERGE_SUCCESS` 수신 시에만 점수/노트 확정, 실패 시 노트 유지 + 실패 안내 |
| WP-003 | P2 | `REJECT` UX 구현 | `src/App.jsx`, `maestro-server.js`, `USER_GUIDE.md` | 반려 액션 입력/전송 가능, 서버 응답 이벤트가 UI에 반영 |
| WP-004 | P2 | 런타임 기본 보안 강화 | `maestro-server.js`, `.env.example`, 문서 | 기본 바인딩/허용 출처 정책 명시, 로컬 기본값 강화 |
| WP-005 | P3 | 테스트 자동화 도입 | `package.json`, `tests/*`, `.github/workflows/*` | 서버/UI/E2E/CI 게이트 + 통합 스모크까지 동작 |
| WP-006 | P1 | 설치 단순화 1차 (`원클릭 실행형`) | `package.json`, `scripts/*`, `README.md`, `USER_GUIDE.md` | 초회 설치 후 단일 명령으로 서버+UI 실행/종료 가능 |
| WP-007 | P1 | 컨텍스트/유지보수 최적화 (App 모듈 분해) | `src/App.jsx`, `src/components/*`, `src/features/*`, `src/hooks/*`, `src/App.ui.test.jsx` | `App.jsx` 450 lines 이하 + 기능 회귀 없음 |

## 3) 실행 계획 (다음 2스프린트)

### Sprint A: 설치 단순화 1차 (`WP-006`)

1. `start:app` 런처 스크립트 도입 (서버 + 프론트 동시 실행, 종료 시 자식 프로세스 정리)
2. 사전 점검(`check`) 단계 도입 (`.env` 존재, 포트 충돌, `MAIN_REPO_PATH` 검증)
3. 온보딩 단순화 (`bootstrap`/`configure`/`start:app` 3단계 문서화)
4. QA 시나리오 추가 (macOS/Windows에서 실행-종료-재실행 체크)

예상 산출물:
- 신규 사용자: 설치 후 단일 명령으로 대시보드 진입
- 운영자: 실행 절차 표준화, 장애 원인(환경/포트) 빠른 식별

### Sprint B: 코드/컨텍스트 최적화 (`WP-007`)

1. `src/App.jsx`에서 기능별 분리
   - `features/maestro-game` (노트/승인/반려/롤백)
   - `features/bach-player` (YouTube/BGM 상태)
   - `components/` (헤더/레인/푸터)
2. 공용 상수/유틸 분리 (`constants`, `utils`)
3. 테스트 분해 및 회귀 보강 (`App.ui.test.jsx` 역할 분리)
4. 기능 동일성 검증 (`npm run qa`, `npm run smoke:integration`, `npm run test:e2e`)

예상 산출물:
- 단일 파일 집중도 완화, 변경 단위 축소
- AI/리뷰 컨텍스트 비용 감소 + 회귀 디버깅 속도 개선

## 4) 완료 정의 (Definition of Done)

- 문서와 실제 동작이 일치해야 함
- 주요 API/이벤트의 성공/실패 케이스가 테스트로 검증되어야 함
- `README`에서 현재 단계와 다음 작업이 한눈에 확인되어야 함
- 설치 단순화 목표(`단일 실행 명령`)가 실제 환경(macOS/Windows)에서 재현되어야 함
- 구조 분해 후에도 기존 승인/반려/롤백/`function bach` 기능이 동일 동작해야 함

## 5) 실행 방식 검토 (Single vs Multi-agent)

결론: 현재 스프린트는 단일에이전트가 기본, 일부 독립 태스크만 선택적으로 병렬화.

- 단일에이전트 권장 구간
  - `WP-001`, `WP-002`, `WP-003`는 서버/프론트/문서가 강하게 결합되어 순차 검증이 필요
  - 인증/이벤트 상태 정합성은 변경 충돌 시 디버깅 비용이 크게 증가
- 멀티에이전트 적용 가능 구간
  - `WP-005` 테스트 작성(서버 API 테스트 vs UI 테스트)
  - 문서 정리/예제 업데이트 등 코드 의존이 낮은 작업
- 운영 기준
  - 공통 파일(`maestro-server.js`, `src/App.jsx`, `README.md`) 동시 수정 작업은 분리하지 않음
  - 병렬 작업이 필요하면 파일 경계를 명확히 나눈 뒤 통합

## 6) 추가 기능 계획: `function bach`

목표: 효과음과 별개로 대시보드에서 유튜브 기반 배경음악(BGM)을 재생/제어.

- 기능명: `function bach`
- 기본 설정
  - 기본 음악 채널: 밝고 힘나는 바흐 음악 채널(기본 채널 URL 사전 등록)
  - 사용자는 채널 URL을 등록/변경 가능
- 요구 기능
  - 유튜브 채널 경로(URL) 등록/수정
  - 배경음악 재생 시작
  - 볼륨 조절(0~100)
  - 일시정지/재생 토글
  - 현재 재생 상태(재생중/일시정지/볼륨/채널) 표시
- 구현 계획
  - UI: `src/App.jsx`에 BGM 컨트롤 패널(채널 입력, 재생, 일시정지, 볼륨 슬라이더) 추가
  - 플레이어: YouTube IFrame Player API 기반 래퍼 컴포넌트 도입
  - 상태관리: BGM 설정/상태를 `localStorage`에 저장해 재실행 시 복원
  - 문서화: `README.md`, `USER_GUIDE.md`에 사용 방법/제약 사항 추가
- 완료 기준
  - 기본 바흐 채널이 초기값으로 표시되고 즉시 재생 가능
  - 사용자 입력 채널 URL로 재생 전환 가능
  - 볼륨/일시정지/재생이 UI와 실제 재생 상태에 일관되게 반영
  - UI 회귀 테스트(컨트롤 동작)와 수동 QA 체크리스트 통과
