# Multi-Agent Connection Layer — Per-Agent Authentication Design

기준일: 2026-07-20
대상 트랙: VU-001 (에이전트 연결 계층)
상태: 설계 확정 (구현 대기)

## 1. 목적

Maestro가 "특정 에이전트(예: OpenClaw)"가 아니라 **여러 에이전트를 표준 방식으로 안전하게 연결**하는 범용 계층을 갖도록 한다. 이번 스펙은 그 첫 벽돌인 **per-agent 인증**을 확정한다.

지원 목표 시나리오 (우선순위):

1. **A. 로컬 CLI 여러 개** — 같은 머신의 여러 에이전트(각자 hook으로 완료 알림). 최우선.
2. **C. 오케스트레이터 + 서브에이전트** — 한 에이전트가 내부적으로 여러 작업을 대표 보고.
3. **B. 원격/다중 머신** — 다른 서버·컨테이너의 에이전트가 네트워크로 연결.

셋 다 결국 지원하되 A부터. 인증 경계는 나중에 바꾸기 가장 아픈 리팩터이므로 **처음부터 per-agent로 설계**한다.

## 2. 확정된 방향 (브레인스토밍 결과)

- **전달 방식: Pull-first 유지.** 초 단위 폴링으로 충분. 에이전트가 결정을 polling으로 가져감. 원격도 인바운드 연결 불필요해 가장 안전. push(SSE/WebSocket)는 이번 범위 밖.
- **인증: per-agent 토큰**을 처음부터 도입.
- **부트스트랩: 서버 토큰으로 등록 → 서버가 per-agent 토큰 1회 발급 → 이후 에이전트는 자기 토큰 사용.** 기존 `MAESTRO_SERVER_TOKEN`은 "등록/관리자" 자격으로 격상.
- **토큰 저장: 해시(sha256)만 저장**, 평문은 발급 시 1회만 반환.

## 3. 인증 경계 (엔드포인트별 자격 매트릭스)

두 자격을 분리한다: **서버 토큰**(운영자/등록·관리) vs **에이전트 토큰**(개별 에이전트 운영).

| 엔드포인트 | 필요 자격 | 비고 |
|---|---|---|
| `POST /api/agents/register` | 서버 토큰 | 등록 관문. 응답에 per-agent 토큰 1회 반환 |
| `POST /api/agents/:id/heartbeat` | 에이전트 토큰 (id 일치) | |
| `POST /api/approval-requests` | 에이전트 토큰 | 요청 `agentId`와 토큰 주인 일치 검증 |
| `GET /api/approval-requests/:id/decision` | 에이전트 토큰 | 자기 요청만 폴링 |
| `POST /api/approval-decisions/:id/ack` | 에이전트 토큰 | |
| `POST /api/agents/:id/revoke` | 서버 토큰 | 토큰 회수(신규) |
| `GET /api/agents`, `/api/history`, `/api/projects`, `/api/work-*` | 서버 토큰 | 대시보드/운영자 |
| WS `APPROVE/REJECT/UNDO` | **현행 유지(무인증)** | 현재 WS 연결은 토큰 검증이 없음. WS 인증 신설은 대시보드(프론트) 변경을 수반하므로 §8 스코프에 따라 **후속 스펙**으로 분리 |
| `POST /api/request` (legacy) | 기존 그대로 | 하위호환, 격상 안 함 |

## 4. 부트스트랩(발급) 흐름

```
운영자/설치 스크립트 ──register(서버 토큰)──▶ 서버
                                     │ 랜덤 토큰 생성 (crypto)
                                     │ sha256(토큰) 만 레코드에 저장
                      ◀──{ agentToken: "<평문>" } 1회 반환──┘
에이전트 ──이후 모든 운영 호출: Authorization: Bearer <agentToken>──▶ 서버
                                     (해시 비교 + agentId 일치 검증)
```

- 평문 토큰은 응답에서 1회만 노출. 서버는 평문을 저장하지 않는다.
- 에이전트가 토큰 저장에 실패하면 재등록으로 재발급(회전).
- **재등록(upsert) = 무조건 토큰 회전.** 같은 `agentId`로 `register`를 다시 호출하면
  `tokenHash`를 항상 새로 발급·교체한다(이것이 §7의 회전 메커니즘). 기존 토큰은 즉시
  무효화되므로, 살아있는 에이전트가 있는 `agentId`를 재등록하면 그 에이전트는 `401`을
  받게 됨을 운영자가 인지해야 한다(설치 스크립트 재실행 시 주의 문구 출력).

## 5. 토큰 저장 (해시 방식)

- 에이전트 레코드에 `tokenHash`(sha256) 필드 추가. 평문 미저장.
- 방금 도입한 `.maestro-agents.json` 영속 스토어(`MAESTRO_AGENT_STORE_PATH`)에 `tokenHash`가 함께 저장/복구 → 재시작 후에도 인증 유지.
- Node 내장 `crypto`만 사용 (의존성 0).

## 6. 하위호환 (기존 흐름 불변)

- **`MAESTRO_SERVER_TOKEN` 미설정(로컬 dev)**: 지금처럼 전부 허용 → 기존 동작 완전 동일.
- **설정 시**: §3 매트릭스대로 per-agent 검증 활성화. 단 **에이전트 토큰이 아직 없는 레거시 에이전트**는 서버 토큰으로도 통과시키는 **grace 경로**를 둔다.
- **기능 플래그 `MAESTRO_AGENT_AUTH_ENFORCE`**(기본 관대):
  - 관대(기본): 에이전트 토큰 있으면 검증, 없으면 서버 토큰 grace 허용.
  - 엄격(`true`): 에이전트 엔드포인트는 반드시 유효한 per-agent 토큰 요구.
- 이로써 안전하게 점진 이행하고, 언제든 관대 모드로 롤백 가능.
- **grace 모드의 한계(명시)**: 서버 토큰에는 "주인 에이전트"가 없으므로, grace 경로로
  통과한 호출에는 §3의 `agentId` 일치 검증을 적용할 수 없다. 즉 **per-agent 격리는
  엄격 모드(`MAESTRO_AGENT_AUTH_ENFORCE=true`)에서만 성립**하며, 관대 모드는 현행과
  동일한 신뢰 수준(서버 토큰 = 전권)이라는 점을 운영 문서에 함께 기재한다.

## 7. 회수 / 회전

- `POST /api/agents/:id/revoke` (서버 토큰) → 해당 에이전트 `tokenHash` 제거 → 즉시 무효화.
- 재등록 시 새 토큰 재발급.

## 8. 스코프 경계 (YAGNI / 세션 충돌 회피)

포함:
- `maestro-server.js` 서버측 인증 로직 + 신규 `revoke` 엔드포인트
- **훅의 1급 프로토콜 이행**: `hooks/notify-maestro.sh`는 현재 legacy `POST /api/request`로만
  전송하므로(에이전트 토큰을 쓸 자리가 없음), 훅/설치 스크립트(`scripts/install-maestro-hook.mjs`)를
  **`POST /api/approval-requests` + 에이전트 토큰** 사용으로 이행한다. legacy `/api/request`는
  §3대로 하위호환용으로 남긴다(훅 구버전 사용자 무영향).
- 서버 회귀 테스트

제외:
- **프론트엔드(`App.jsx` 등) 변경 없음.** 대시보드 토큰 관리 UI는 별도 후속(동시 진행 중인 터치 UX 세션과의 충돌 회피 목적).
- push/SSE 전달 (pull 유지)
- RBAC / 역할 세분화

### agentsview 참조 결정 (외부 시스템 검토 반영)

`https://github.com/kenn-io/agentsview` (MIT, Go) 검토 결과를 아래로 확정한다:

- **분석/관찰(observability)은 위임.** 세션 검색·비용·활동 통계는 agentsview가 전문이므로 Maestro가 재구현하지 않는다. 필요 시 agentsview REST API를 참조(후순위).
- **`discovery` 어댑터는 예약만.** 파일시스템 세션 발견(에이전트가 `~/.claude/projects/` 등에 남긴 기록 자동 감지) 패턴은 유효하나, 이번 범위에서는 구현하지 않는다. 어댑터 타입을 `hook / wrapper / native / (예약) discovery`로 문서화해 재설계 없이 추가할 자리만 확보한다. 자동 감지가 필요해지면 자체 watcher 대신 agentsview API에서 목록을 읽는 방식을 우선 검토한다.

## 9. 테스트 계획

서버 회귀:
- `register`가 per-agent 토큰을 1회 반환하고 `tokenHash`만 저장한다.
- 발급된 에이전트 토큰으로 heartbeat / approval-request / decision 폴링 / ack 성공.
- 남의 토큰·틀린 토큰·토큰 누락 → `401`.
- **자기(유효한) 토큰으로 남의 승인 요청 decision 폴링 → 차단(`403` 또는 `404`)** — §3 "자기 요청만 폴링"의 직접 검증.
- `MAESTRO_SERVER_TOKEN` 미설정 시 관대 모드로 기존 동작 유지.
- `MAESTRO_AGENT_AUTH_ENFORCE=true` 엄격 모드에서 토큰 없는 에이전트 호출 `401`.
- `revoke` 후 해당 토큰 `401`.
- 재시작 후에도 토큰 유효(영속화와 결합).

게이트: `npm run qa`.

## 10. 완료 정의

- §3 매트릭스대로 per-agent 인증이 동작하고, §6 하위호환으로 기존 승인 흐름에 회귀가 없다.
- 재시작 후에도 에이전트 인증·pull 결정이 유지된다.
- 프론트 변경 없이 서버+훅 범위에서 완결된다.
- A(로컬) 시나리오가 per-agent 토큰으로 안전하게 붙고, B(원격)로 확장할 인증 경계가 마련된다.
