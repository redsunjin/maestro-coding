import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SUPPORTED_TARGETS = new Set(['git-post-commit', 'claude-stop', 'all']);
const CLAUDE_COMMAND = 'sh hooks/notify-maestro.sh';
const GIT_BLOCK_START = '# >>> MAESTRO POST-COMMIT HOOK >>>';
const GIT_BLOCK_END = '# <<< MAESTRO POST-COMMIT HOOK <<<';
const GIT_BLOCK = `${GIT_BLOCK_START}
if [ "\${MAESTRO_HOOK_DISABLED:-0}" = "1" ]; then
  exit 0
fi
sh "$(git rev-parse --show-toplevel)/hooks/notify-maestro.sh"
${GIT_BLOCK_END}`;

function parseArgs(argv) {
  const options = {
    target: 'all',
    repoRoot: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      options.target = arg.slice('--target='.length);
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.slice('--repo-root='.length));
      continue;
    }
    if (arg === '--register') {
      options.register = true;
      continue;
    }
    if (arg.startsWith('--agent-id=')) {
      options.agentId = arg.slice('--agent-id='.length);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`unknown_arg:${arg}`);
  }

  if (!SUPPORTED_TARGETS.has(options.target)) {
    throw new Error(`unsupported_target:${options.target}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/install-maestro-hook.mjs [--target=all|git-post-commit|claude-stop] [--repo-root=/path/to/repo]

Targets:
  all              Install both git post-commit and Claude Stop hook adapters
  git-post-commit  Install/update .git/hooks/post-commit
  claude-stop      Install/update .claude/settings.json Stop hook

Options:
  --register           서버에 에이전트를 등록하고 per-agent 토큰을 1회 발급받아 출력
                       (env: MAESTRO_URL, MAESTRO_SERVER_TOKEN, AGENT_ID)
  --agent-id=<id>      --register 시 사용할 에이전트 ID (기본: AGENT_ID env 또는 terminal_agent)

주의: 같은 agent-id로 --register를 다시 실행하면 토큰이 회전되어
      기존에 발급된 토큰은 즉시 무효화됩니다.
`);
}

function resolveRepoRoot(explicitRepoRoot) {
  if (explicitRepoRoot) return explicitRepoRoot;

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
  } catch {
    return process.cwd();
  }
}

function ensureNotifyScriptExists(repoRoot) {
  const notifyScriptPath = path.join(repoRoot, 'hooks', 'notify-maestro.sh');
  if (!existsSync(notifyScriptPath)) {
    throw new Error(`notify_script_missing:${notifyScriptPath}`);
  }
}

function upsertManagedBlock(content, block, startMarker, endMarker) {
  if (content.includes(startMarker) && content.includes(endMarker)) {
    const pattern = new RegExp(`${escapeForRegExp(startMarker)}[\\s\\S]*?${escapeForRegExp(endMarker)}`);
    return content.replace(pattern, block);
  }

  if (!content.trim()) {
    return `#!/bin/sh\n\n${block}\n`;
  }

  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  return `${normalized}\n${block}\n`;
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function installGitPostCommitHook(repoRoot) {
  const gitDir = path.join(repoRoot, '.git');
  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, 'post-commit');

  if (!existsSync(gitDir)) {
    throw new Error(`git_dir_missing:${gitDir}`);
  }

  mkdirSync(hooksDir, { recursive: true });
  const current = existsSync(hookPath) ? readFileSync(hookPath, 'utf8') : '';
  const next = upsertManagedBlock(current, GIT_BLOCK, GIT_BLOCK_START, GIT_BLOCK_END);
  writeFileSync(hookPath, next, 'utf8');
  chmodSync(hookPath, 0o755);
  return hookPath;
}

function createDefaultClaudeSettings() {
  return {
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: CLAUDE_COMMAND,
            },
          ],
        },
      ],
    },
  };
}

function installClaudeStopHook(repoRoot) {
  const claudeDir = path.join(repoRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  mkdirSync(claudeDir, { recursive: true });

  let settings = createDefaultClaudeSettings();
  if (existsSync(settingsPath)) {
    const raw = readFileSync(settingsPath, 'utf8').trim();
    if (raw) {
      settings = JSON.parse(raw);
    }
  }

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    settings = createDefaultClaudeSettings();
  }

  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  if (!Array.isArray(settings.hooks.Stop)) {
    settings.hooks.Stop = [];
  }

  const hasExistingCommand = settings.hooks.Stop.some((entry) => (
    entry
    && typeof entry === 'object'
    && Array.isArray(entry.hooks)
    && entry.hooks.some((hook) => hook?.type === 'command' && hook?.command === CLAUDE_COMMAND)
  ));

  if (!hasExistingCommand) {
    settings.hooks.Stop.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: CLAUDE_COMMAND,
        },
      ],
    });
  }

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settingsPath;
}

async function registerAgentForToken(repoRoot, agentId) {
  const maestroUrl = process.env.MAESTRO_URL || 'http://localhost:8080';
  const serverToken = process.env.MAESTRO_SERVER_TOKEN || '';
  const headers = { 'Content-Type': 'application/json' };
  if (serverToken) headers.Authorization = `Bearer ${serverToken}`;

  const response = await fetch(`${maestroUrl}/api/agents/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agentId,
      adapterType: 'hook',
      repoRoot,
      displayName: agentId,
      capabilities: ['approval-request'],
    }),
  });

  if (response.status === 401) {
    throw new Error('register_unauthorized: MAESTRO_SERVER_TOKEN 값을 확인하세요');
  }
  if (!response.ok) {
    throw new Error(`register_failed:${response.status}`);
  }

  const body = await response.json();
  return body.agentToken || null;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = resolveRepoRoot(options.repoRoot);
  ensureNotifyScriptExists(repoRoot);

  const installed = [];
  if (options.target === 'all' || options.target === 'git-post-commit') {
    installed.push({
      target: 'git-post-commit',
      path: installGitPostCommitHook(repoRoot),
    });
  }

  if (options.target === 'all' || options.target === 'claude-stop') {
    installed.push({
      target: 'claude-stop',
      path: installClaudeStopHook(repoRoot),
    });
  }

  console.log(`Installed Maestro hook adapters in ${repoRoot}`);
  for (const item of installed) {
    console.log(`- ${item.target}: ${item.path}`);
  }

  if (options.register) {
    const agentId = options.agentId || process.env.AGENT_ID || 'terminal_agent';
    console.log(`\n에이전트 등록 중... (agentId: ${agentId})`);
    console.log('⚠️  같은 agentId로 재등록하면 토큰이 회전되어 기존 토큰은 즉시 무효화됩니다.');
    const agentToken = await registerAgentForToken(repoRoot, agentId);
    if (agentToken) {
      console.log('\n✅ per-agent 토큰이 발급되었습니다. 이 토큰은 지금 한 번만 표시됩니다:');
      console.log(`\n   export MAESTRO_AGENT_TOKEN=${agentToken}`);
      console.log('\n훅 실행 환경에 위 환경변수를 설정하면 1급 프로토콜(/api/approval-requests)을 사용합니다.');
    } else {
      console.log('\n등록 완료 (서버가 토큰을 반환하지 않았습니다 — 서버 버전을 확인하세요).');
    }
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to install Maestro hook adapters: ${message}`);
  process.exit(1);
});
