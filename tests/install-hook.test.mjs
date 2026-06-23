import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const INSTALLER_PATH = path.join(REPO_ROOT, 'scripts', 'install-maestro-hook.mjs');

function createTempRepo() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'maestro-hook-test-'));
  mkdirSync(path.join(tempRoot, 'hooks'), { recursive: true });
  writeFileSync(path.join(tempRoot, 'hooks', 'notify-maestro.sh'), '#!/bin/sh\necho "notify"\n', 'utf8');
  execFileSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });
  return tempRoot;
}

function runInstaller(repoRoot, target = 'all') {
  execFileSync(process.execPath, [INSTALLER_PATH, `--repo-root=${repoRoot}`, `--target=${target}`], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });
}

test('installer creates an idempotent git post-commit hook', () => {
  const repoRoot = createTempRepo();
  try {
    runInstaller(repoRoot, 'git-post-commit');
    runInstaller(repoRoot, 'git-post-commit');

    const hookPath = path.join(repoRoot, '.git', 'hooks', 'post-commit');
    const hookContent = readFileSync(hookPath, 'utf8');

    assert.match(hookContent, /^#!\/bin\/sh/m);
    assert.equal(hookContent.includes('MAESTRO POST-COMMIT HOOK'), true);
    assert.equal(hookContent.includes('sh "$(git rev-parse --show-toplevel)/hooks/notify-maestro.sh"'), true);
    assert.equal((hookContent.match(/MAESTRO POST-COMMIT HOOK/g) || []).length, 2);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('installer adds Claude Stop hook without dropping existing settings', () => {
  const repoRoot = createTempRepo();
  try {
    mkdirSync(path.join(repoRoot, '.claude'), { recursive: true });
    writeFileSync(path.join(repoRoot, '.claude', 'settings.json'), JSON.stringify({
      theme: 'dark',
      hooks: {
        Stop: [
          {
            matcher: 'lint',
            hooks: [
              { type: 'command', command: 'npm run lint' },
            ],
          },
        ],
      },
    }, null, 2));

    runInstaller(repoRoot, 'claude-stop');
    runInstaller(repoRoot, 'claude-stop');

    const settings = JSON.parse(readFileSync(path.join(repoRoot, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.theme, 'dark');
    assert.ok(Array.isArray(settings.hooks.Stop));
    assert.equal(
      settings.hooks.Stop.some((entry) => entry.matcher === 'lint' && entry.hooks?.some((hook) => hook.command === 'npm run lint')),
      true,
    );
    assert.equal(
      settings.hooks.Stop.filter((entry) => entry.hooks?.some((hook) => hook.command === 'sh hooks/notify-maestro.sh')).length,
      1,
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
