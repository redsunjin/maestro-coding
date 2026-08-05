# 이메일 커넥터 (참조 클라이언트, 목 드라이버)

비전 §4(d)의 이메일 업무 루프 데모: 받은편지함 → `email-triage`(체인 루트)
→ 승인 → `email-reply`(체인) → 승인 → 발송(드라이버) → ack.
Workflow 공개 계약만 사용하며, 서버 코드는 무변경이다.

## 실행

    npm run server                                # 터미널 1 (workflow/)
    node examples/email-connector/connector.mjs   # 터미널 2

엄격 모드면 두 터미널 모두 `MAESTRO_WORKFLOW_SERVER_TOKEN`을 지정한다.
대시보드(레인)에서 ✉/↩ 프리셋 카드를 승인·반려하면 커넥터가 WS로 결정을
받아 발송을 시뮬레이션하고 요약을 출력한다.

## 실제 이메일 연결 (후속)

`mockInbox.mjs`와 같은 인터페이스(`listUnprocessed` / `send` /
`markProcessed`)로 IMAP 또는 Gmail API 드라이버를 구현해 `connector.mjs`에서
교체하면 된다 — 커넥터 본체(`lib.mjs`)는 수정 불필요. 이메일 자격증명은
커넥터 프로세스에만 머물고 Workflow 서버에는 절대 전달되지 않는다.
