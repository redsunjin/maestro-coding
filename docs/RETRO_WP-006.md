# WP-006 회고 (설치 단순화 1차)

기준일: 2026-02-28
범위: `WP-006` (`check:env` + `start:app` + 실행 가이드 정리)

## 1) 목표 대비 결과

- 목표: 초회 설치 후 실행 진입 절차를 단순화
- 결과: 달성
  - `npm run check:env`로 환경 오류를 실행 전에 식별
  - `npm run start:app` 단일 명령으로 서버+UI 동시 실행
  - `Ctrl+C` 종료 시 자식 프로세스 정리 확인

## 2) 구현 항목

- 스크립트
  - `scripts/preflight.mjs`
  - `scripts/start-app.mjs`
  - `scripts/env-utils.mjs`
- npm scripts
  - `check:env`
  - `start:app`
- 문서
  - `README.md` Quick Start 경로 갱신
  - `USER_GUIDE.md` 트러블슈팅 섹션 추가

## 3) 검증 결과

- 자동
  - `npm run qa` 통과
  - `npm run smoke:integration` 통과
- 수동
  - `start:app` 기동 성공
  - `Ctrl+C` 종료 후 `maestro-server.js`/`vite` orphan 프로세스 없음
  - `.env` 누락 시 preflight 실패 메시지 확인

## 4) 좋았던 점

- 실행 실패를 런타임 전 단계에서 빠르게 노출할 수 있게 됨
- 문서와 실제 실행 경로가 일치
- 기존 QA 파이프라인을 유지한 채 개발자 경험 개선

## 5) 아쉬운 점 / 리스크

- `.env` 기반이라 최초 설정은 여전히 필요
- OS/권한/포트 정책에 따라 preflight 포트 점검이 경고로만 남을 수 있음
- 완전한 배포형 앱(Electron/Tauri) 경험과는 차이가 있음

## 6) 후속 액션

1. `WP-007` 진행: `src/App.jsx` 모듈 분해로 유지보수/컨텍스트 비용 절감
2. preflight 고도화: 오류 메시지에 수정 예시를 더 구체화
3. 운영 로그 축적: start 실패 유형(포트/경로/권한) 분류 후 가이드 개선
