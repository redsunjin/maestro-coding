#!/usr/bin/env node
// maestro-server CLI — 서버를 한 줄로 실행한다. (npx maestro-server / 플러그인 monitor 공용 진입점)
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startMaestroServer } from '../lib/server-embed.mjs';

const HELP = `maestro-server — Maestro 승인 서버 실행

사용법:
  maestro-server [옵션]

옵션:
  --port <n>     포트 (기본 8080)
  --host <h>     바인딩 호스트 (기본 127.0.0.1 — iPad 등 LAN 접속은 0.0.0.0)
  --repo <path>  관리할 git 레포 경로 (기본: 현재 폴더가 git 레포면 현재 폴더)
  --no-mdns      Bonjour(mDNS) 광고 끄기
  --token <t>    서버 인증 토큰 (MAESTRO_SERVER_TOKEN)
  -h, --help     도움말

이미 같은 포트에 Maestro 서버가 떠 있으면 재사용하고 종료합니다.`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      port: { type: 'string', default: '8080' },
      host: { type: 'string', default: '127.0.0.1' },
      repo: { type: 'string' },
      'no-mdns': { type: 'boolean', default: false },
      token: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (error) {
  console.error(`인자 오류: ${error.message}\n`);
  console.error(HELP);
  process.exit(1);
}

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

let repoPath = values.repo ? path.resolve(values.repo) : undefined;
if (!repoPath && existsSync(path.resolve(process.cwd(), '.git'))) {
  repoPath = process.cwd();
}

let handle;
try {
  handle = await startMaestroServer({
    port: Number(values.port),
    host: values.host,
    repoPath,
    mdns: !values['no-mdns'],
    token: values.token,
    onLog: (line) => console.log(line),
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (handle.alreadyRunning) {
  console.log(`이미 실행 중인 Maestro 서버를 재사용합니다: ${handle.url}`);
  console.log(`대시보드/iPad 연결 주소: ${handle.wsUrl}`);
  process.exit(0);
}

// ready 출력 전에 핸들러부터 등록 — 소비자가 ready 라인을 보고 보낸 시그널을 놓치지 않는다
const shutdown = async () => {
  await handle.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`\n🎼 Maestro 서버 실행 중 (pid ${handle.pid})`);
console.log(`   연결 주소: ${handle.wsUrl}${values.host === '0.0.0.0' ? ' (iPad에서는 ws://<이 PC의 LAN IP>:' + handle.port + ')' : ''}`);
console.log('   종료: Ctrl+C\n');

const { code } = (await handle.waitForExit()) || {};
process.exit(typeof code === 'number' ? code : 0);
