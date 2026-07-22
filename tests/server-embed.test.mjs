import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { startMaestroServer } from '../lib/server-embed.mjs';

const ROOT_DIR_FOR_TEST = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

test('maestro-server CLI boots, reports address, and shuts down on SIGTERM', async (t) => {
  const repoPath = createFixtureRepo();
  t.after(() => rmSync(repoPath, { recursive: true, force: true }));

  const port = randomPort();
  const { spawn } = await import('node:child_process');
  const cli = spawn(process.execPath, [
    resolve(ROOT_DIR_FOR_TEST, 'bin/maestro-server.mjs'),
    '--port', String(port),
    '--repo', repoPath,
    '--no-mdns',
  ], {
    env: { ...process.env, ...scratchEnv('cli') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  cli.stdout.on('data', (chunk) => { output += chunk.toString(); });
  cli.stderr.on('data', (chunk) => { output += chunk.toString(); });

  // CLI의 ready 라인(시그널 핸들러 등록 이후 출력)을 기준으로 대기 — 조기 SIGTERM 레이스 방지
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !output.includes('Maestro 서버 실행 중')) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  assert.ok(output.includes('Maestro 서버 실행 중'), `CLI가 ready를 출력하지 않음. output:\n${output}`);
  assert.ok(output.includes(`ws://127.0.0.1:${port}`), 'CLI가 연결 주소를 안내하지 않음');

  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.status, 'ok');

  cli.kill('SIGTERM');
  await new Promise((resolveExit) => cli.once('exit', resolveExit));

  // 서버(자식)도 함께 내려갔는지 폴링으로 확인 (종료 타이밍 레이스 방지)
  const serverGone = await (async () => {
    const shutdownDeadline = Date.now() + 4000;
    while (Date.now() < shutdownDeadline) {
      try {
        await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      } catch {
        return true;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }
    return false;
  })();
  assert.ok(serverGone, 'CLI 종료 후에도 서버가 살아 있음');
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
