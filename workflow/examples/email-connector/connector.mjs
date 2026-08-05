#!/usr/bin/env node
// 이메일 커넥터 CLI (목 드라이버). 실행 전 workflow 서버가 떠 있어야 한다.
//   MAESTRO_WORKFLOW_SERVER_TOKEN=<서버토큰> node connector.mjs
// 서버 토큰은 actor 등록에만 쓰이고, 이후는 발급받은 actor 토큰으로만 통신한다.
import { runEmailConnector } from './lib.mjs';
import { createMockInboxDriver } from './mockInbox.mjs';

const serverUrl = process.env.MAESTRO_WORKFLOW_SERVER_URL || 'http://127.0.0.1:8090';
const serverToken = process.env.MAESTRO_WORKFLOW_SERVER_TOKEN || '';

const driver = createMockInboxDriver();
const summary = await runEmailConnector({
  serverUrl,
  serverToken,
  driver,
  log: console.log,
});

console.log('\n── 처리 요약 ──');
console.log(JSON.stringify(summary, null, 2));
