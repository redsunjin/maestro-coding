import { registerLocalRepoSource } from './sourceRegistry.js';
import { coerceArray, hashString, normalizeTimestamp, toNumber } from './types.js';

export const LOCAL_REPO_BRIDGE_GLOBAL_KEYS = Object.freeze([
  '__MAESTRO_PLAYER_LOCAL_REPO_BRIDGE__',
  'maestroPlayerLocalRepoBridge',
  'maestroLocalRepoBridge',
]);

export function detectLocalRepoBridge(globalObject = globalThis) {
  if (!globalObject || (typeof globalObject !== 'object' && typeof globalObject !== 'function')) {
    return null;
  }

  for (const key of LOCAL_REPO_BRIDGE_GLOBAL_KEYS) {
    const candidate = globalObject[key];
    if (isLocalRepoBridge(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function hasLocalRepoBridge(globalObject = globalThis) {
  return Boolean(detectLocalRepoBridge(globalObject));
}

export async function loadLocalRepoReplayEvents(input = {}) {
  const bridge = resolveLocalRepoBridge(input);
  const loadEvents = pickLoadMethod(bridge);
  const request = buildBridgeRequest(input);
  const rawResult = await loadEvents.call(bridge, request);
  const normalizedResult = normalizeLocalRepoBridgeResult(rawResult, request);

  return {
    bridge,
    source: normalizedResult.source,
    replayEvents: normalizedResult.replayEvents,
  };
}

export function normalizeLocalRepoBridgeResult(rawResult, request = {}) {
  const payload = Array.isArray(rawResult)
    ? { events: rawResult }
    : (rawResult && typeof rawResult === 'object' ? rawResult : {});

  const source = createLocalRepoBridgeSource({
    ...request,
    ...(payload.source || {}),
  });
  const replayEvents = coerceArray(payload.events).map((event, index) => normalizeLocalRepoEvent(event, {
    index,
    request,
    source,
  }));

  return { source, replayEvents };
}

export function createLocalRepoBridgeSource(input = {}) {
  const repoPath = firstString(input.repoPath, input.targetPathOrId, input.sourceLabel, '/workspace/local-repo');
  const branchName = firstString(input.branchName, input.ref, input.defaultBranch, null);
  const sourceLabel = firstString(input.sourceLabel, input.targetPathOrId, repoPath, 'Local Repo');
  const source = registerLocalRepoSource({
    repoPath,
    branchName,
    sourceLabel,
    visibility: input.visibility || 'private',
  });

  return {
    ...source,
    metadata: {
      ...source.metadata,
      repoId: firstString(input.repoId, source.sourceLabel),
      bridgeName: firstString(input.bridgeName, input.name, null),
      bridgeVersion: firstString(input.bridgeVersion, input.version, null),
      defaultBranch: firstString(input.defaultBranch, branchName, null),
    },
  };
}

function resolveLocalRepoBridge(input = {}) {
  if (isLocalRepoBridge(input.bridge)) {
    return input.bridge;
  }

  const detectedBridge = detectLocalRepoBridge(input.globalObject || globalThis);
  if (detectedBridge) {
    return detectedBridge;
  }

  throw new Error('local repo bridge is unavailable');
}

function isLocalRepoBridge(candidate) {
  return Boolean(candidate) && typeof pickLoadMethod(candidate, false) === 'function';
}

function pickLoadMethod(bridge, shouldThrow = true) {
  const loadMethod = bridge?.loadLocalRepoReplayEvents || bridge?.loadReplayEvents;

  if (typeof loadMethod === 'function') {
    return loadMethod;
  }

  if (!shouldThrow) {
    return null;
  }

  throw new Error('local repo bridge must expose loadLocalRepoReplayEvents(request) or loadReplayEvents(request)');
}

function buildBridgeRequest(input) {
  const request = {};

  if (hasText(input.repoPath)) {
    request.repoPath = String(input.repoPath);
  }

  if (hasText(input.branchName)) {
    request.branchName = String(input.branchName);
  } else if (hasText(input.ref)) {
    request.ref = String(input.ref);
  }

  if (Number.isFinite(input.maxCommits) && input.maxCommits > 0) {
    request.maxCommits = Math.floor(input.maxCommits);
  }

  if (hasText(input.since)) {
    request.since = String(input.since);
  }

  if (hasText(input.until)) {
    request.until = String(input.until);
  }

  if (hasText(input.repoId)) {
    request.repoId = String(input.repoId);
  }

  if (hasText(input.sourceLabel)) {
    request.sourceLabel = String(input.sourceLabel);
  }

  return request;
}

function normalizeLocalRepoEvent(rawEvent, options) {
  const source = options.source;
  const request = options.request || {};
  const changedFiles = normalizeChangedFiles(rawEvent?.changedFiles ?? rawEvent?.files ?? rawEvent?.paths);
  const eventId = firstString(
    rawEvent?.eventId,
    rawEvent?.id,
    rawEvent?.commitSha,
    rawEvent?.sha,
    rawEvent?.replayId,
    `local-event-${options.index}`,
  );
  const branchName = firstString(
    rawEvent?.branchName,
    rawEvent?.branch,
    source.branchName,
    request.branchName,
    request.ref,
    'main',
  );
  const timestamp = normalizeTimestamp(
    rawEvent?.timestamp ?? rawEvent?.occurredAt ?? rawEvent?.date,
    options.index,
  );
  const eventType = normalizeEventType(rawEvent?.eventType ?? rawEvent?.type);
  const linesAdded = toNumber(rawEvent?.linesAdded ?? rawEvent?.additions);
  const linesDeleted = toNumber(rawEvent?.linesDeleted ?? rawEvent?.deletions);
  const filesChanged = changedFiles.length || toNumber(rawEvent?.filesChanged);
  const newFileCount = countNewFiles(changedFiles, rawEvent?.newFileCount);

  return {
    ...rawEvent,
    eventId,
    sourceType: 'git-local',
    repoId: firstString(rawEvent?.repoId, request.repoId, source.metadata.repoId, source.sourceLabel),
    sourceLabel: firstString(rawEvent?.sourceLabel, source.sourceLabel),
    eventType,
    timestamp,
    actor: firstString(rawEvent?.actor, rawEvent?.author, rawEvent?.authorName, 'unknown'),
    branchName,
    commitSha: firstString(rawEvent?.commitSha, rawEvent?.sha, null),
    title: firstString(rawEvent?.title, rawEvent?.message, rawEvent?.commitSha, eventId),
    message: firstString(rawEvent?.message, rawEvent?.title, rawEvent?.commitSha, eventId),
    changedFiles,
    filesChanged,
    linesAdded,
    linesDeleted,
    newFileCount,
    newDirectoryCount: countNewDirectories(changedFiles, rawEvent?.newDirectoryCount),
    weight: normalizeWeight(rawEvent?.weight, {
      changedFiles,
      linesAdded,
      linesDeleted,
    }),
    replayId: firstString(rawEvent?.replayId, `local:${hashString(`${eventId}:${branchName}:${timestamp}`)}`),
  };
}

function normalizeChangedFiles(value) {
  return coerceArray(value)
    .map((entry) => normalizeChangedFile(entry))
    .filter(Boolean);
}

function normalizeChangedFile(entry) {
  if (typeof entry === 'string') {
    return entry.trim() || null;
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const filePath = firstString(entry.path, entry.filePath, entry.filename, entry.name, null);
  if (!filePath) {
    return null;
  }

  if (entry.isNew || entry.status === 'added' || entry.status === 'new') {
    return filePath.startsWith('new:') ? filePath : `new:${filePath}`;
  }

  return filePath;
}

function normalizeEventType(value) {
  const normalized = String(value || 'commit').trim().toLowerCase();

  if (normalized === 'rollback') {
    return 'revert';
  }

  return normalized || 'commit';
}

function countNewFiles(changedFiles, fallback) {
  const derivedCount = changedFiles.filter((filePath) => filePath.startsWith('new:')).length;
  return derivedCount || toNumber(fallback);
}

function countNewDirectories(changedFiles, fallback) {
  const directories = new Set();

  changedFiles
    .filter((filePath) => filePath.startsWith('new:'))
    .forEach((filePath) => {
      const normalizedPath = filePath.replace(/^new:/, '');
      const [topLevelDirectory] = normalizedPath.split('/');
      if (topLevelDirectory) {
        directories.add(topLevelDirectory);
      }
    });

  return directories.size || toNumber(fallback);
}

function normalizeWeight(weight, options) {
  const numericWeight = Number(weight);
  if (Number.isFinite(numericWeight) && numericWeight > 0) {
    return numericWeight;
  }

  return Math.max(1, options.linesAdded + options.linesDeleted + options.changedFiles.length);
}

function firstString(...values) {
  for (const value of values) {
    if (hasText(value)) {
      return String(value);
    }
  }

  return values.at(-1) ?? null;
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined && value !== '';
}
