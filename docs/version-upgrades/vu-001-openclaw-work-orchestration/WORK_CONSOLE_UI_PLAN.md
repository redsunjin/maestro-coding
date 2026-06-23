# Work Console UI Plan

기준일: 2026-03-28
대상 트랙: `VU-001`
상태: 설계 초안

## 1. 목표

Work Console UI는 VS Code의 보조 사이드바처럼 동작하되, 메신저가 아니라 작업 관제 패널이어야 한다.

핵심 UX 목표:

- 열기/닫기
- 좌/우 도킹
- 세션 전환
- 명령 입력
- 카드 기반 상태 보기

## 2. 레이아웃 원칙

### 기본 배치

- 기본 도킹 위치: 오른쪽
- 옵션: 왼쪽 또는 오른쪽 이동 가능
- 패널은 기존 `History`/`Repo`/`AutoOps`와 별개로 독립 토글

### 패널 구성

1. 헤더
2. 세션 리스트
3. 현재 세션 타임라인
4. 명령 입력창

### 뷰 모드

- `collapsed`
- `docked-right`
- `docked-left`
- 필요 시 추후 `floating` 검토 가능, MVP 범위에서는 제외

## 3. 헤더 설계

헤더 요소:

- `Work` 토글 버튼
- 현재 도킹 위치 표시
- 좌/우 이동 버튼
- 닫기 버튼
- 현재 세션 상태 뱃지

권장 액션:

- `Move Left`
- `Move Right`
- `Close`

## 4. 세션 리스트

### 목적

- 여러 Work Session 중 현재 작업 대상을 빠르게 고를 수 있어야 한다.

### 카드 요소

- 세션 제목
- 프로젝트 이름
- 상태 뱃지
- 마지막 활동 시각
- 에이전트 이름
- 미해결 질문 개수 또는 pending badge

### 정렬 기준

1. `active / blocked / pending decision`
2. 최근 업데이트 순

### 필터 기준

- 프로젝트
- 상태
- 에이전트

## 5. 현재 세션 타임라인

타임라인은 단순 채팅 버블이 아니라 카드와 메시지가 섞인 이벤트 스트림이어야 한다.

표시 타입:

- `message`
- `command`
- `command_result`
- `plan_card`
- `question_card`
- `commit_proposal_card`
- `delivery_card`
- `decision_event`

## 6. 카드 설계

### Plan Card

필드:

- 계획 요약
- 단계 목록
- 리스크
- 검증 전략
- 결정 버튼

액션:

- `Approve Plan`
- `Request Revision`
- `Reject Plan`

### Commit Proposal Card

필드:

- 제안 커밋 메시지
- 변경 파일 목록
- diff 요약
- 테스트 결과
- 생성 브랜치

액션:

- `Accept Proposal`
- `Revise Message`
- `Return`

### Delivery Card

필드:

- branch
- commit sha
- diff 요약
- 실행 테스트
- 관련 계획 버전

액션:

- `Promote to Approval Lane`
- `Return to Agent`

## 7. 명령 입력창

### 입력 정책

- 일반 텍스트와 slash command를 같은 입력창에서 받는다.
- Enter: 전송
- Shift+Enter: 줄바꿈

### 입력 보조

- 최근 명령 히스토리
- slash command 자동완성
- 현재 세션 상태에 따라 허용 명령 가이드

### placeholder 예시

- `/work 승인 이력 export 설계해줘`
- `/plan`
- `/status`
- `/commit feat: add history export`

## 8. 상태별 UI 규칙

### 세션이 없을 때

- 빈 화면 안내
- `새 작업 시작` CTA

### OpenClaw 응답 대기 중

- `waiting for assistant` 상태 표시
- 명령 재전송 버튼은 기본 비활성 또는 제한

### 보류 상태

- operator decision 필요 배지
- 해당 카드 상단 고정 가능

### 장애 상태

- 에러 배너
- 재시도 버튼
- 마지막 성공 응답 시각 표시

## 9. 도킹 동작 규칙

### 좌/우 이동

- 위치 설정은 로컬 저장
- 재접속 후 이전 위치 복원

### 열기/닫기

- 열림 여부도 로컬 저장 가능
- 그러나 첫 진입 기본값은 닫힘 권장

### 레이아웃 충돌 방지

- `History`, `Repo`, `AutoOps`처럼 오버레이 성격의 패널과 동시에 열려도 화면이 무너지지 않게 해야 한다.
- Work Console은 더 큰 패널이므로 우선순위를 별도 조정해야 한다.

## 10. 접근성 요구사항

- `aria-expanded`, `aria-controls`
- 패널 오픈 시 첫 포커스 이동
- 세션 타임라인 신규 이벤트는 `aria-live`
- 키보드만으로 세션 이동/명령 전송 가능
- 카드 결정 버튼은 명확한 레이블 필요

## 11. 모바일/좁은 뷰포트

MVP에서는 모바일 전체 대응보다 `좁은 데스크톱` 대응이 우선이다.

권장 정책:

- 넓은 화면: 좌/우 도킹 패널
- 좁은 화면: 바텀시트 또는 풀오버로 전환
- 세션 리스트는 탭 또는 접이식 섹션으로 축소

## 12. 구현 순서

1. 패널 쉘 + 헤더 + 도킹 상태 저장
2. 세션 리스트
3. 타임라인 렌더러
4. 명령 입력창
5. 구조화 카드 렌더러
6. 접근성/좁은 화면 대응

## 13. 금지할 패턴

- 무제한 스크롤 메시지 누적
- merge/rollback을 채팅 입력창에서 직접 실행
- 단순 텍스트만으로 계획/전달물 결정을 처리
- 시스템 상태와 자유 대화를 구분하지 않는 타임라인
