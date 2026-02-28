# 설치 단순화 1차 계획 (`원클릭 실행형`)

기준일: 2026-02-28  
진행상태: 완료 (2026-02-28)

## 1) 목표

`앱 설치 파일(.dmg/.exe)`을 바로 만들기보다, 현재 웹+서버 구조를 유지하면서 **초기 설치/실행을 1개 명령으로 단순화**합니다.

- 목표 UX
  - 최초: `npm install` -> `npm run configure` -> `npm run start:app`
  - 재실행: `npm run start:app` 1회
- 비목표(1차 범위 밖)
  - Electron/Tauri 패키징
  - 자동 업데이트/코드 서명

## 2) 왜 이 방향인가

- 현재 구조는 서버(`maestro-server.js`) + 프론트(Vite) 동시 실행이 필요해 진입 장벽이 큼
- 실제 성능 병목보다 실행 복잡도가 더 큰 문제
- 앱 패키징은 배포/서명/업데이트 비용이 즉시 증가하므로 MVP 단계 ROI가 낮음

## 3) 작업 범위 (WP-006)

1. 런처 스크립트 추가: `scripts/start-app.mjs`
- 서버(`npm run server`)와 UI(`npm run dev`)를 동시에 실행
- 프로세스 종료 시 자식 프로세스 정리(SIGINT/SIGTERM)
- 서버 health 체크(`/health`) 성공 시 실행 완료 메시지 출력

2. 사전 점검 스크립트: `scripts/preflight.mjs`
- `.env` 파일 존재 여부 확인
- `PORT`, `VITE_WS_URL`, `MAIN_REPO_PATH` 기본 정합성 점검
- `MAIN_REPO_PATH`가 git repo인지 확인

3. `package.json` 스크립트 정리
- `start:app`: preflight -> 병렬 실행
- `check:env`: 환경 점검
- (선택) `start:app:mock`: 서버 없이 데모 실행 모드

4. 문서/가이드 정리
- `README.md`, `USER_GUIDE.md`에 1차 표준 실행 경로 반영
- 장애 대응 섹션(포트 충돌, .env 누락, ws 연결 실패) 추가

### 구현 결과 (2026-02-28)

- 추가: `scripts/preflight.mjs` (`npm run check:env`)
- 추가: `scripts/start-app.mjs` (`npm run start:app`)
- 추가: `scripts/env-utils.mjs` (`.env` 파싱 공용 유틸)
- 반영: `package.json`에 `check:env`, `start:app` 스크립트 등록
- 반영: `README.md`, `USER_GUIDE.md` 실행 경로/트러블슈팅 업데이트

## 4) 보안 가드레일

- 기본 `HOST=127.0.0.1` 유지
- `ALLOWED_ORIGINS` 화이트리스트 강제 안내
- `MAESTRO_SERVER_TOKEN` 사용 권장(문서에서 기본 경로로 노출)
- 런처는 git 명령을 자동 실행하지 않음(승인 흐름 외 불필요 권한 방지)

## 5) QA/검증 계획

1. 자동 검증
- `npm run qa`
- `npm run smoke:integration`

2. 수동 검증
- macOS: `npm run start:app` 실행/종료/재실행
- Windows(PowerShell): 동일 시나리오
- 포트 충돌 상황에서 오류 메시지 확인
- `.env` 누락 시 안내 메시지 확인

3. 완료 기준 (DoD)
- 신규 사용자 기준 10분 내 대시보드 진입 가능
- 재실행은 단일 명령 1회로 가능
- 종료 시 orphan process가 남지 않음

## 6) 소스 최적화 종합 검토 (WP-007 연계)

### 현재 진단

- `src/App.jsx`가 1228 lines로 기능이 과밀
- 상태/이펙트 훅이 많아 회귀 영향 범위가 큼
- 빌드 크기(JS gzip 약 71 kB)는 즉시 성능 최적화가 필요한 수준은 아님

### 필요한 최적화 (우선순위)

1. P1: 구조 분해(필수)
- `App.jsx`를 기능별 모듈로 분리
- 목표: `App.jsx` 450 lines 이하

2. P1: 테스트 분해(필수)
- `App.ui.test.jsx`를 기능 단위로 분리해 실패 지점 명확화

3. P2: 문서 최신화(권장)
- 현황 날짜, 완료/진행 상태 동기화 자동화 또는 체크리스트화

4. P3: 런타임 성능(선택)
- 필요 시 이후 코드 스플리팅/렌더 최적화 검토

### 결론

1차는 설치/실행 단순화(`WP-006`)가 우선이며, 곧바로 구조 분해(`WP-007`)를 이어서 진행하는 것이 비용 대비 효과가 가장 큽니다.
