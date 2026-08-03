import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relPath) => readFileSync(resolve(ROOT_DIR, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(read(relPath));

test('plugin and marketplace manifests are valid and consistent', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json');
  assert.match(marketplace.name, /^[a-z0-9-]+$/);
  assert.ok(marketplace.owner?.name);
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'maestro');
  assert.equal(marketplace.plugins[0].source, './');

  const plugin = readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'maestro');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(plugin.hooks, './plugin/hooks.json');
  assert.equal(plugin.skills, './plugin/skills/');
  assert.equal(plugin.experimental?.monitors, './plugin/monitors.json');
});

test('hooks and monitors reference existing executable scripts', () => {
  const hooks = readJson('plugin/hooks.json');
  const hookCommands = [
    ...hooks.hooks.SessionStart.flatMap((entry) => entry.hooks.map((hook) => hook.command)),
    ...hooks.hooks.Stop.flatMap((entry) => entry.hooks.map((hook) => hook.command)),
  ];
  const monitors = readJson('plugin/monitors.json');
  assert.ok(Array.isArray(monitors) && monitors.length === 1);
  assert.equal(monitors[0].name, 'maestro-server');
  assert.equal(monitors[0].when, 'always');

  const allCommands = [...hookCommands, monitors[0].command];
  for (const command of allCommands) {
    assert.ok(command.includes('${CLAUDE_PLUGIN_ROOT}'), `플러그인 루트 변수 미사용: ${command}`);
    const relPath = command.replaceAll('"', '').replace('${CLAUDE_PLUGIN_ROOT}/', '');
    const absPath = resolve(ROOT_DIR, relPath);
    assert.ok(existsSync(absPath), `참조 파일 없음: ${relPath}`);
    accessSync(absPath, constants.X_OK);
  }

  assert.ok(existsSync(resolve(ROOT_DIR, 'plugin/skills/status/SKILL.md')), '/maestro:status 스킬 없음');
});

test('server runtime deps live in dependencies so --omit=dev installs still work', () => {
  // 설치된 플러그인 사본은 ensure-deps가 --omit=dev로 설치한다.
  // ws가 devDependencies에 있으면 제외되어 서버가 못 뜬다 (실환경에서 발견된 버그의 회귀 방지).
  const pkg = readJson('package.json');
  assert.ok(pkg.dependencies?.ws, 'ws가 dependencies에 없음');
  assert.ok(pkg.dependencies?.['bonjour-service'], 'bonjour-service가 dependencies에 없음');
  assert.ok(!pkg.devDependencies?.ws, 'ws가 devDependencies에 중복');
});

test('ensure-deps exits 0 immediately when ws is already installed', () => {
  const output = execFileSync('sh', [resolve(ROOT_DIR, 'plugin/scripts/ensure-deps.sh')], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT_DIR },
    timeout: 10000,
  }).toString();
  // 이미 설치된 상태에서는 빠르게 조용히 성공해야 한다
  assert.equal(output.trim(), '');
});

test('notify-maestro hook exits 0 even when the server is unreachable', () => {
  const output = execFileSync('sh', [resolve(ROOT_DIR, 'hooks/notify-maestro.sh')], {
    cwd: ROOT_DIR,
    env: { ...process.env, MAESTRO_URL: 'http://127.0.0.1:19' },
    timeout: 15000,
  }).toString();
  assert.ok(output.includes('연결할 수 없습니다'));
});

test('run-server-quiet boots the server with filtered output and cleans up on SIGTERM', async (t) => {
  const repoPath = mkdtempSync(resolve(os.tmpdir(), 'maestro-plugin-repo-'));
  const git = (...args) => execFileSync('git', ['-C', repoPath, ...args]);
  git('init', '-qb', 'main');
  git('config', 'user.email', 'p@test.local');
  git('config', 'user.name', 'P');
  writeFileSync(resolve(repoPath, 'README.md'), '# plugin fixture\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  t.after(() => rmSync(repoPath, { recursive: true, force: true }));

  const port = 15000 + Math.floor(Math.random() * 2000);
  const child = spawn('sh', [resolve(ROOT_DIR, 'plugin/scripts/run-server-quiet.sh')], {
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: ROOT_DIR,
      CLAUDE_PROJECT_DIR: repoPath,
      MAESTRO_PLUGIN_PORT: String(port),
      MAESTRO_MDNS: 'off',
      MAESTRO_HISTORY_STORE_PATH: resolve(os.tmpdir(), `maestro-plugin-history-${Date.now()}.json`),
      MAESTRO_AGENT_STORE_PATH: resolve(os.tmpdir(), `maestro-plugin-agents-${Date.now()}.json`),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  // 어떤 assert가 실패해도 detached 프로세스 그룹(sh/grep/node 서버)을 반드시 정리한다.
  // 정리 없이는 파이프가 열린 채 남아 node --test 전체가 영원히 끝나지 않는다
  // (2026-07-31~08-03 CI 행 사고의 원인). 성공 경로의 명시적 SIGTERM 후에는 no-op.
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch { /* 이미 종료됨 */ }
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  // 저속 러너(이미지 교체 직후 등)에서 20초 부팅 데드라인이 간헐적으로 초과되어 45초로 완화
  const deadline = Date.now() + 45000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { healthy = true; break; }
    } catch { /* not up yet */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  assert.ok(healthy, `monitor server never became healthy. output:\n${output}`);

  // 소음 필터: 기동 안내는 통과, 서버 배너의 장황한 라인(에이전트 API 예시 등)은 차단.
  // health 응답은 listen 콜백의 기동 로그가 파이프(grep)를 거쳐 'data' 이벤트로
  // 도달하기 전에 성공할 수 있으므로, 기동 라인은 별도 폴링으로 기다린다 (CI 플레이크 방지).
  const hasBootLine = () => output.includes('Maestro 서버 실행 중') || output.includes('재사용');
  const bootLineDeadline = Date.now() + 10000;
  while (Date.now() < bootLineDeadline && !hasBootLine()) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  assert.ok(hasBootLine(), `기동 라인 없음:\n${output}`);
  assert.ok(!output.includes('curl -X POST'), `배너 소음이 필터를 통과함:\n${output}`);

  process.kill(-child.pid, 'SIGTERM');
  await new Promise((resolveExit) => child.once('exit', resolveExit));

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
  assert.ok(serverGone, '모니터 종료 후에도 서버가 살아 있음');
});
