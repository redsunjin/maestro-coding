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

function run() {
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
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to install Maestro hook adapters: ${message}`);
  process.exit(1);
}
