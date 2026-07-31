# Maestro Workflow 서브앱 설계 — 2앱 분리 (Coding / Workflow)

기준일: 2026-07-31
상태: 설계 확정 (구현 대기)
상위 비전: [`docs/vision/2026-07-21-universal-approval-record-service.md`](../../vision/2026-07-21-universal-approval-record-service.md)

## 0. 확정된 방향 (브레인스토밍 결과)

| 결정 항목 | 확정 |
|---|---|
| 제품 구분 | **Maestro Coding**(코드 승인, 본체)과 **Maestro Workflow**(범용 승인·결정·이력)를 별개 앱으로 분리 |
| 분리 방식 | **플레이어 패턴** — 같은 레포 안 `workflow/` 서브앱, 자체 서버·대시보드로 개별 서비스 실행 |
| 출발점 | 본체 승인 코어(ApprovalRequest/Decision, pull+ack, per-agent 토큰, 이력 영속화)를 **복사·이식해 일반화** (import 의존 없음) |
| UX 톤 | 레인(스트림덱) UX 계승, **리듬게임 요소(판정등급·콤보·타격음·햅틱)는 제외** |
| 첫 결정 유형 | **범용 subjectType(자유 문자열) + 표시 프리셋 2종**(`spend` 지출, `publish` 외부 발송) |
| 비전 문서와의 관계 | 비전 문서의 "Maestro 자체 진화(단일 앱)" 결정을 "2앱 분리"로 개정 (주석 추가) |

> 참고: 비전 문서(2026-07-21)는 "Maestro 자체 진화"를 확정했으나, 이후 사용자가
> "Coding과 Workflow 2개 앱 분리"로 방향을 전환했다(2026-07-31). 이 스펙이 그 전환의
> 첫 실행 단위다. 비전의 엔티티 모델·위임 철학·로드맵은 그대로 유효하며, 실행 형태만
> "한 앱의 확장"에서 "자매 앱 신설"로 바뀐다.

## 1. 구조와 경계

```
maestro-coding/                     ← 현재 레포 (이름 유지)
├── (본체: src/, maestro-server.js, tests/ — 이 스펙의 범위 밖, 불가침)
├── player/                         ← Maestro Player (선례 패턴)
├── workflow/                       ← Maestro Workflow (신규)
│   ├── package.json                ← 자체 의존성·스크립트 (본체와 독립)
│   ├── server.js                   ← 결정 서버 (기본 포트 8090)
│   ├── src/                        ← 대시보드 (React + Vite + Tailwind)
│   ├── tests/                      ← 서버/UI 테스트
│   ├── .env.example
│   └── README.md                   ← 서브프로젝트 소개 + 경계 규칙
└── docs/maestro-workflow/          ← 전용 기획/설계 문서
```

**경계 규칙 (player/ 선례의 명문화 규칙 계승):**

- 구현은 `workflow/` 아래에서만, 문서는 `docs/maestro-workflow/` 아래에서만 진행한다.
- 본체 경로(`src/`, `tests/`, `maestro-server.js`, `hooks/`)는 절대 수정하지 않는다.
- 본체 코드를 import하지 않는다. 프로토콜/로직은 복사·일반화해 가져온다 (의존 0 = 충돌 0).
- 전용 브랜치 `feat/maestro-workflow-foundation`에서 작업하고 작은 PR로 나눠 머지한다.
- 포트 분리: 본체 8080 / Workflow 8090 (환경변수로 변경 가능). 동시 실행 가능해야 한다.

## 2. 데이터 모델 (이식 + 일반화)

본체에서 검증된 모델을 가져오되, 코드 도메인 전용 필드를 일반화한다.

### DecisionRequest — `ApprovalRequest`의 일반화

```json
{
  "requestId": "dcr_1753900000000",
  "actorId": "research_agent_01",
  "subjectType": "spend",
  "subject": {
    "title": "API 크레딧 $30 구매",
    "summary": "리서치 작업용 외부 API 크레딧 충전",
    "payload": { "amount": 30, "currency": "USD", "purpose": "research-api" }
  },
  "status": "pending_decision",
  "source": "agent",
  "createdAt": "...", "updatedAt": "..."
}
```

- `subjectType`: 자유 문자열. 서버는 유형을 등록제로 제한하지 않는다 (record-only라 안전).
- `subject.payload`: 유형별 자유 JSON. 서버는 저장·표시만 하고 해석하지 않는다.
- 본체의 `branchName` / `diffSummary` / `repoRoot` 같은 코드 전용 필드는 없다.

### Decision — 본체 어휘 그대로

```json
{
  "decisionId": "dcd_1753900100000",
  "requestId": "dcr_1753900000000",
  "decision": "approve",
  "comment": "승인. 한도 내 지출.",
  "executorAction": "none",
  "delivery": { "mode": "pull", "status": "available", "acknowledgedAt": null },
  "decidedBy": "operator",
  "createdAt": "..."
}
```

- `decision`: `approve | reject | revise | ask | cancel` (본체와 동일 어휘).
- **`executorAction`은 MVP에서 항상 `none`** (record-only). Workflow는 아무것도 실행하지
  않는다 — 결정을 기록하고 요청자에게 전달할 뿐, 집행은 요청자(에이전트)의 몫이다.
  필드를 스키마에 남겨두는 이유는 향후 유형별 executor를 붙일 자리 확보다.

### Actor — Agent Registry + per-agent 토큰 이식

- `POST /api/actors/register` → 랜덤 토큰 1회 반환, 서버는 `tokenHash`(sha256)만 저장.
- 재등록 = 토큰 회전. revoke 지원. `.maestro-workflow-actors.json` 파일 영속화.
- 본체와 달리 **처음부터 엄격 모드만** 지원한다 (grace 경로 없음 — 레거시가 없으므로).
  단, 본체처럼 서버 토큰(`MAESTRO_WORKFLOW_SERVER_TOKEN`) 미설정 시 로컬 dev 전부 허용.

### AuditLog — append-only 이력

- 본체 history 패턴 이식: 링버퍼 + `GET /api/history` + `.maestro-workflow-history.json`
  영속화 + WebSocket `HISTORY_APPEND`.
- 기록 대상: 요청 생성, 결정, ack, actor 등록/회수. 레코드 단위 직렬화(향후 체이닝 여지).

### 프리셋 2종 — 서버 분기 없음

`spend`와 `publish`는 **대시보드 표시 포맷 + 요청 예제 템플릿**일 뿐이다.

- `spend`: payload에 `amount`, `currency`, `purpose` → 노트에 금액 강조 표시.
- `publish`: payload에 `target`, `contentSummary` → 노트에 발송 대상 강조 표시.
- 그 외 subjectType은 generic 카드(title/summary)로 표시된다. 서버 코드는 유형을 모른다.

## 3. API (검증된 계약 이식)

| 엔드포인트 | 자격 | 비고 |
|---|---|---|
| `POST /api/actors/register` | 서버 토큰 | per-actor 토큰 1회 발급 |
| `POST /api/actors/:id/heartbeat` | actor 토큰 | |
| `POST /api/actors/:id/revoke` | 서버 토큰 | 토큰 무효화 |
| `POST /api/decision-requests` | actor 토큰 | `actorId` 일치 검증 |
| `GET /api/decision-requests/:id/decision` | actor 토큰 | 자기 요청만 폴링 (pull) |
| `POST /api/decisions/:id/ack` | actor 토큰 | `delivery.status=acknowledged` |
| `POST /api/decision-requests/:id/decide` | 서버 토큰 | 운영자 결정 생성 (대시보드가 호출). 본체의 WS 액션 방식 대신 REST로 통일 |
| `GET /api/history`, `GET /api/decision-requests` | 서버 토큰 | 운영자/대시보드 |
| WS 브로드캐스트 | 현행 본체 방식 | 대시보드 실시간 표시 |
| `GET /health` | 없음 | |

- Pull-first + ack는 본체 계약 그대로 (2026-07-20 per-agent 인증 스펙의 자격 매트릭스 준용).
- 본체의 legacy `/api/request` 같은 하위호환 경로는 만들지 않는다 (레거시가 없다).

## 4. 대시보드 (레인 UX 계승, 게임 최소)

- **레인 = 결정 채널**: subjectType별로 채널이 배정되고 노트가 흘러온다. 채널 수는
  본체의 laneCount 패턴처럼 설정 가능(기본 4).
- 노트 탭 → 상세 시트(title/summary/payload 표시) → **APPROVE / REJECT** (반려는 본체의
  터치 반려 시트 패턴: 사유 칩 + 자유 입력). `revise/ask/cancel`은 상세 시트의 보조 액션.
- 터치 우선 원칙 유지: 44px 탭 타깃, press 피드백, hover 전용 조작 금지.
- **제외**: 판정등급(PERFECT 등)·콤보·점수·타격음·햅틱·BGM(function bach). 차분한 관제탑 톤.
- 이력 뷰: 결정 원장 리스트 — 누가(actor)·무엇을(subject)·언제·어떻게(decision)·왜(comment).

## 5. 테스트 / 품질 게이트

- `workflow/tests/`에 서버 회귀 테스트: 등록/토큰/요청 생성/결정/pull/ack/이력 영속화/
  재시작 복구/타 actor 접근 차단(403/404).
- UI 최소 테스트: 노트 렌더/승인/반려 플로우.
- `workflow/package.json`에 `test` 스크립트. 루트 CI에 workflow 테스트 잡 추가는
  구현 마지막 단계에서 (루트 `package.json`/CI 설정 1~2줄 — 본체 코드 무변경 예외로 허용).
- e2e: workflow 자체 e2e는 MVP 범위 밖 (서버 회귀 + UI 테스트로 게이트).

## 6. MVP 범위 밖 (YAGNI)

- Policy/조건부 자동승인, Delegation — 후속 (본체 WP-008 일반화는 그 다음 스펙)
- 에이전트가 decider가 되는 경로 (MVP는 사람이 모든 결정)
- executor 실행 (전부 record-only)
- 다중 운영자/RBAC, push 전달(SSE/WS push), 본체와의 상호 연동(Coding↔Workflow 브리지)
- subjectType 등록제/스키마 검증

## 7. 성공 기준

1. 에이전트가 actor 토큰으로 `subjectType=spend` 요청 전송 → Workflow 대시보드(8090)
   채널에 노트 표시 → 사람이 탭으로 승인 → 에이전트가 pull로 결정 수신 → ack → 전 과정이
   이력에 남고 서버 재시작 후에도 복구된다.
2. 본체(8080)와 동시 실행되며, 본체 파일은 커밋 diff에 나타나지 않는다(CI 설정 제외).
3. `workflow/` 테스트가 루트 어디서든 `npm test --prefix workflow`로 통과한다.

## 8. 구현 순서 (리스크순)

1. **서버 수직 슬라이스**: actors(register/token) → decision-requests → decision(수동 API)
   → pull/ack → 파일 영속화 + 테스트 — *가장 위험한 이식·일반화를 먼저 검증*
2. **대시보드 셸**: WS 연결 + 채널 레인 + 노트 표시
3. **결정 UX**: 승인/반려 시트 + 프리셋 표시 포맷 (spend/publish)
4. **이력 뷰** + 재시작 복구 확인
5. **CI 잡 추가** + `docs/maestro-workflow/README.md` + 비전 문서 개정 주석
