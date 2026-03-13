import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LANE_COUNT, sanitizeLaneCount } from '../shared/lane-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECT_REGISTRY_FILE = process.env.MAESTRO_PROJECT_REGISTRY_PATH || '.maestro-projects.json';

export const PROJECT_REGISTRY_PATH = path.resolve(ROOT_DIR, PROJECT_REGISTRY_FILE);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

export function resolveProjectPath(projectPath, baseDir = process.cwd()) {
  const normalizedPath = String(projectPath || '').trim();
  if (!normalizedPath) return '';
  return path.resolve(baseDir, normalizedPath);
}

export function isGitRepository(projectPath) {
  return existsSync(path.join(projectPath, '.git'));
}

export function inferProjectName(projectPath) {
  const baseName = path.basename(projectPath || '');
  return baseName || 'maestro-project';
}

export function inferProjectRemoteUrl(projectPath) {
  try {
    return execFileSync('git', ['-C', projectPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function toProjectId(name, projectPath, existingProjects, preferredId = '') {
  const existingIds = new Set(existingProjects.map((project) => project.id));
  const initialId = slugify(preferredId || name || inferProjectName(projectPath) || path.basename(projectPath) || 'project') || 'project';
  let nextId = initialId;
  let suffix = 2;
  while (existingIds.has(nextId)) {
    nextId = `${initialId}-${suffix}`;
    suffix += 1;
  }
  return nextId;
}

function normalizeRegistryProject(project, existingProjects = []) {
  const projectPath = resolveProjectPath(project.path || project.projectPath || '');
  if (!projectPath) return null;

  const name = String(project.name || inferProjectName(projectPath)).trim() || inferProjectName(projectPath);
  const repoUrl = String(project.repoUrl || '').trim();
  const laneCount = sanitizeLaneCount(project.laneCount, DEFAULT_LANE_COUNT);
  const createdAt = normalizeIsoDate(project.createdAt, new Date().toISOString());
  const updatedAt = normalizeIsoDate(project.updatedAt, createdAt);
  const lastUsedAt = normalizeIsoDate(project.lastUsedAt, null);

  return {
    id: String(project.id || '').trim() || toProjectId(name, projectPath, existingProjects),
    name,
    path: projectPath,
    repoUrl,
    laneCount,
    createdAt,
    updatedAt,
    lastUsedAt,
  };
}

export function readProjectRegistry(registryPath = PROJECT_REGISTRY_PATH) {
  if (!existsSync(registryPath)) {
    return [];
  }

  try {
    const raw = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (!Array.isArray(raw)) {
      return [];
    }

    const normalizedProjects = [];
    const seenPaths = new Set();

    for (const project of raw) {
      const normalized = normalizeRegistryProject(project, normalizedProjects);
      if (!normalized) continue;
      if (seenPaths.has(normalized.path)) continue;
      seenPaths.add(normalized.path);
      normalizedProjects.push(normalized);
    }

    return normalizedProjects;
  } catch {
    return [];
  }
}

export function writeProjectRegistry(projects, registryPath = PROJECT_REGISTRY_PATH) {
  writeFileSync(registryPath, JSON.stringify(projects, null, 2) + '\n', 'utf8');
}

export function sortProjects(projects) {
  return [...projects].sort((left, right) => {
    const leftUsed = left.lastUsedAt || '';
    const rightUsed = right.lastUsedAt || '';
    if (leftUsed !== rightUsed) {
      return rightUsed.localeCompare(leftUsed);
    }
    return left.name.localeCompare(right.name, 'ko');
  });
}

export function upsertProjectEntry(projectInput, registryPath = PROJECT_REGISTRY_PATH) {
  const projects = readProjectRegistry(registryPath);
  const projectPath = resolveProjectPath(projectInput.path);
  const existingIndex = projects.findIndex((project) => project.path === projectPath || project.id === projectInput.id);
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const current = projects[existingIndex];
    const updated = {
      ...current,
      name: String(projectInput.name || current.name || inferProjectName(projectPath)).trim() || current.name,
      path: projectPath,
      repoUrl: String(projectInput.repoUrl ?? current.repoUrl ?? '').trim(),
      laneCount: sanitizeLaneCount(projectInput.laneCount, current.laneCount || DEFAULT_LANE_COUNT),
      updatedAt: now,
    };
    projects[existingIndex] = updated;
    writeProjectRegistry(sortProjects(projects), registryPath);
    return updated;
  }

  const created = normalizeRegistryProject({
    id: projectInput.id || '',
    name: projectInput.name,
    path: projectPath,
    repoUrl: projectInput.repoUrl,
    laneCount: projectInput.laneCount,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  }, projects);

  const nextProjects = sortProjects([...projects, created]);
  writeProjectRegistry(nextProjects, registryPath);
  return created;
}

export function markProjectUsed(projectId, registryPath = PROJECT_REGISTRY_PATH) {
  const projects = readProjectRegistry(registryPath);
  const targetIndex = projects.findIndex((project) => project.id === projectId);
  if (targetIndex === -1) {
    return null;
  }

  const updated = {
    ...projects[targetIndex],
    lastUsedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects[targetIndex] = updated;
  writeProjectRegistry(sortProjects(projects), registryPath);
  return updated;
}

export function formatProjectChoiceTitle(project) {
  const remoteSuffix = project.repoUrl ? ` · ${project.repoUrl}` : '';
  return `${project.name} (${project.laneCount || DEFAULT_LANE_COUNT} lanes) — ${project.path}${remoteSuffix}`;
}
