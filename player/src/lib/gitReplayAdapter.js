import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { hashString } from './types.js';

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';
const HEADER_TERMINATOR = '\u001d';

const PRETTY_FORMAT = [
  '%H',
  '%P',
  '%an',
  '%ae',
  '%aI',
  '%s',
  '%B',
  '%D',
].join(`${FIELD_SEPARATOR}`);

export function loadGitReplayEvents(options = {}) {
  const repoPath = resolveGitRepoPath(options.repoPath || process.cwd());
  const ref = options.ref || 'HEAD';
  const branchName = options.branchName || resolveGitBranchName(repoPath, ref);
  const repoId = options.repoId || basename(repoPath);
  const gitLogOutput = readGitLog(repoPath, options);

  return parseGitLogOutput(gitLogOutput, {
    repoId,
    repoPath,
    branchName,
    ref,
  });
}

export function parseGitLogOutput(rawOutput, options = {}) {
  const repoId = options.repoId || 'git-replay';
  const branchName = options.branchName || options.ref || 'HEAD';
  const records = String(rawOutput || '')
    .split(RECORD_SEPARATOR)
    .filter(Boolean);

  return records
    .map((record, index) => parseGitLogRecord(record, {
      repoId,
      branchName,
      index,
    }))
    .filter(Boolean);
}

export function buildGitLogArgs(options = {}) {
  const args = ['log'];
  const ref = options.ref || 'HEAD';

  args.push('--date=iso-strict');
  args.push(`--pretty=format:${RECORD_SEPARATOR}${PRETTY_FORMAT}${HEADER_TERMINATOR}`);
  args.push('--numstat');
  args.push('--summary');

  if (options.reverse !== false) {
    args.push('--reverse');
  }

  if (options.since) {
    args.push(`--since=${options.since}`);
  }

  if (options.until) {
    args.push(`--until=${options.until}`);
  }

  if (Number.isFinite(options.maxCommits) && options.maxCommits > 0) {
    args.push(`-${Math.floor(options.maxCommits)}`);
  }

  args.push(ref);

  return args;
}

export function resolveGitBranchName(repoPath, ref = 'HEAD') {
  const result = runGitReadCommand(repoPath, ['rev-parse', '--abbrev-ref', ref]);
  const rawBranchName = result.stdout.trim();

  if (!rawBranchName || rawBranchName === 'HEAD') {
    return ref;
  }

  return rawBranchName;
}

function readGitLog(repoPath, options) {
  const result = runGitReadCommand(repoPath, buildGitLogArgs(options));
  return result.stdout;
}

function runGitReadCommand(repoPath, args) {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git command failed: git ${args.join(' ')}`);
  }

  return result;
}

function parseGitLogRecord(record, options) {
  const [headerBlock, detailsBlock = ''] = record.split(HEADER_TERMINATOR);
  const [
    commitSha,
    parentShas = '',
    authorName = '',
    authorEmail = '',
    timestamp = '',
    subject = '',
    body = '',
    refs = '',
  ] = headerBlock.split(FIELD_SEPARATOR);

  if (!commitSha) {
    return null;
  }

  const fileEntries = new Map();
  const newFilePaths = new Set();
  const detailLines = detailsBlock.split('\n');

  let linesAdded = 0;
  let linesDeleted = 0;

  for (const detailLine of detailLines) {
    const line = detailLine.trim();
    if (!line) {
      continue;
    }

    const numstatMatch = detailLine.match(/^([0-9-]+)\t([0-9-]+)\t(.+)$/);
    if (numstatMatch) {
      const addedValue = numstatMatch[1] === '-' ? 0 : Number(numstatMatch[1]);
      const deletedValue = numstatMatch[2] === '-' ? 0 : Number(numstatMatch[2]);
      const filePath = normalizeGitPath(numstatMatch[3]);
      const entry = fileEntries.get(filePath) || { path: filePath, added: 0, deleted: 0, isNew: false };
      entry.added += Number.isFinite(addedValue) ? addedValue : 0;
      entry.deleted += Number.isFinite(deletedValue) ? deletedValue : 0;
      fileEntries.set(filePath, entry);
      linesAdded += entry.added === addedValue ? addedValue : 0;
      linesDeleted += entry.deleted === deletedValue ? deletedValue : 0;
      continue;
    }

    const newFileMatch = detailLine.match(/^(?:create mode|new file mode) [0-9]+ (.+)$/);
    if (newFileMatch) {
      const filePath = normalizeGitPath(newFileMatch[1]);
      const entry = fileEntries.get(filePath) || { path: filePath, added: 0, deleted: 0, isNew: false };
      entry.isNew = true;
      fileEntries.set(filePath, entry);
      newFilePaths.add(filePath);
    }
  }

  const changedFiles = [...fileEntries.values()].map((entry) => (entry.isNew ? `new:${entry.path}` : entry.path));
  const eventType = detectEventType(subject, body, parentShas);
  const branchName = pickBranchName(options.branchName, refs);

  return {
    eventId: commitSha,
    sourceType: 'git',
    repoId: options.repoId,
    sourceLabel: options.repoPath,
    eventType,
    timestamp,
    actor: authorName || authorEmail || 'unknown',
    authorEmail,
    branchName,
    commitSha,
    parentShas: parentShas ? parentShas.split(' ').filter(Boolean) : [],
    title: subject.trim(),
    message: body.trim() || subject.trim(),
    refs: refs.trim(),
    changedFiles,
    filesChanged: changedFiles.length,
    linesAdded,
    linesDeleted,
    newFileCount: newFilePaths.size,
    newDirectoryCount: countNewDirectories(newFilePaths),
    weight: Math.max(1, linesAdded + linesDeleted + changedFiles.length),
    replayId: `git:${hashString(`${commitSha}:${branchName}`)}`,
  };
}

function detectEventType(subject, body, parentShas) {
  const normalizedSubject = String(subject || '').trim().toLowerCase();
  const normalizedBody = String(body || '').trim().toLowerCase();
  const parentCount = String(parentShas || '').trim().split(/\s+/).filter(Boolean).length;

  if (parentCount > 1 || normalizedSubject.startsWith('merge ')) {
    return 'merge';
  }

  if (normalizedSubject.startsWith('revert ') || normalizedBody.includes('this reverts commit')) {
    return 'revert';
  }

  return 'commit';
}

function pickBranchName(fallbackBranchName, refs) {
  const refNames = String(refs || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const headRef = refNames.find((value) => value.startsWith('HEAD -> '));
  if (headRef) {
    return headRef.replace('HEAD -> ', '').trim();
  }

  const localBranch = refNames.find((value) => !value.startsWith('origin/') && !value.startsWith('tag: '));
  if (localBranch) {
    return localBranch.trim();
  }

  return fallbackBranchName;
}

function resolveGitRepoPath(repoPath) {
  const resolvedPath = resolve(repoPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`git repo path does not exist: ${resolvedPath}`);
  }
  return resolvedPath;
}

function normalizeGitPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').trim();
}

function countNewDirectories(newFilePaths) {
  const directories = new Set();
  for (const filePath of newFilePaths) {
    const [topLevelDirectory] = String(filePath).split('/');
    if (topLevelDirectory) {
      directories.add(topLevelDirectory);
    }
  }
  return directories.size;
}
