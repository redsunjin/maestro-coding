import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { startMaestroServer } from '../lib/server-embed.mjs';

function randomPort() {
  return 14000 + Math.floor(Math.random() * 2000);
}

function createFixtureRepo() {
  const repoPath = mkdtempSync(resolve(os.tmpdir(), 'maestro-embed-repo-'));
  const git = (...args) => execFileSync('git', ['-C', repoPath, ...args]);
  git('init', '-qb', 'main');
  git('config', 'user.email', 'embed@test.local');
  git('config', 'user.name', 'Embed');
  writeFileSync(resolve(repoPath, 'README.md'), '# embed fixture\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  return repoPath;
}

const scratchEnv = (label) => ({
  MAESTRO_HISTORY_STORE_PATH: resolve(os.tmpdir(), `maestro-embed-history-${label}-${Date.now()}.json`),
  MAESTRO_AGENT_STORE_PATH: resolve(os.tmpdir(), `maestro-embed-agents-${label}-${Date.now()}.json`),
});

async function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('startMaestroServer boots the server against a repo and stops it', async (t) => {
  const repoPath = createFixtureRepo();
  t.after(() => rmSync(repoPath, { recursive: true, force: true }));

  const handle = await startMaestroServer({
    port: randomPort(),
    repoPath,
    mdns: false,
    env: scratchEnv('boot'),
  });

  assert.equal(handle.alreadyRunning, false);
  assert.ok(handle.pid > 0);
  assert.equal(handle.wsUrl, `ws://127.0.0.1:${handle.port}`);

  const health = await (await fetch(`${handle.url}/health`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.project.path, repoPath);

  await handle.stop();
  assert.equal(await isProcessAlive(handle.pid), false);

  // stop은 멱등
  await handle.stop();
});

test('startMaestroServer reuses an already-running server', async (t) => {
  const repoPath = createFixtureRepo();
  t.after(() => rmSync(repoPath, { recursive: true, force: true }));

  const first = await startMaestroServer({
    port: randomPort(),
    repoPath,
    mdns: false,
    env: scratchEnv('reuse'),
  });
  t.after(() => first.stop());

  const second = await startMaestroServer({ port: first.port, repoPath, mdns: false });
  assert.equal(second.alreadyRunning, true);
  assert.equal(second.pid, null);

  // 재사용 핸들의 stop은 기존 서버를 죽이지 않는다
  await second.stop();
  const health = await (await fetch(`${first.url}/health`)).json();
  assert.equal(health.status, 'ok');
});

test('startMaestroServer disables mdns advertising when mdns:false', async (t) => {
  const repoPath = createFixtureRepo();
  t.after(() => rmSync(repoPath, { recursive: true, force: true }));

  const lines = [];
  const handle = await startMaestroServer({
    port: randomPort(),
    repoPath,
    mdns: false,
    env: scratchEnv('mdns'),
    onLog: (line) => lines.push(line),
  });
  t.after(() => handle.stop());

  // 기동 로그가 이미 수집됐고 mDNS 광고 라인이 없어야 한다
  assert.ok(lines.some((line) => line.includes('Maestro Backend Server')), `no boot log in: ${lines.slice(0, 3).join(' | ')}`);
  assert.ok(!lines.some((line) => line.includes('mDNS 광고:')), 'mdns:false인데 광고 로그 존재');
});

test('startMaestroServer fails clearly when the port is held by a non-Maestro process', async (t) => {
  const port = randomPort();
  const blocker = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('not maestro');
  });
  await new Promise((resolveListen) => blocker.listen(port, '127.0.0.1', resolveListen));
  t.after(() => new Promise((resolveClose) => blocker.close(resolveClose)));

  await assert.rejects(
    () => startMaestroServer({ port, mdns: false, startTimeoutMs: 4000 }),
    (error) => {
      assert.match(error.message, /Maestro 서버가 아닙니다/);
      return true;
    },
  );
});
