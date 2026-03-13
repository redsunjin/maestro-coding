import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import {
  markProjectUsed,
  readProjectRegistry,
  resolveProjectPath,
  upsertProjectEntry,
} from '../scripts/project-registry.mjs';

test('project registry upserts by path without creating duplicates', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'maestro-project-registry-'));
  const registryPath = path.join(tempDir, 'projects.json');

  try {
    const projectPath = resolveProjectPath(path.join(tempDir, 'sample-project'));
    const first = upsertProjectEntry({
      name: 'sample-project',
      path: projectPath,
      repoUrl: 'https://example.com/org/sample-project.git',
    }, registryPath);

    const second = upsertProjectEntry({
      name: 'sample-project-renamed',
      path: projectPath,
      repoUrl: 'git@github.com:org/sample-project.git',
    }, registryPath);

    const projects = readProjectRegistry(registryPath);

    assert.equal(first.id, second.id);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'sample-project-renamed');
    assert.equal(projects[0].repoUrl, 'git@github.com:org/sample-project.git');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('project registry marks last used timestamp', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'maestro-project-registry-'));
  const registryPath = path.join(tempDir, 'projects.json');

  try {
    const created = upsertProjectEntry({
      name: 'alpha',
      path: path.join(tempDir, 'alpha'),
      repoUrl: '',
    }, registryPath);

    const marked = markProjectUsed(created.id, registryPath);
    const projects = readProjectRegistry(registryPath);

    assert.ok(marked?.lastUsedAt);
    assert.equal(projects[0].id, created.id);
    assert.equal(projects[0].lastUsedAt, marked.lastUsedAt);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
