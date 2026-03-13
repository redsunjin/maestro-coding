#!/usr/bin/env node

import prompts from 'prompts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEnvValues,
  DEFAULT_ALLOWED_ORIGINS,
  readEnvFile,
  writeEnvFile,
} from './env-utils.mjs';
import {
  formatProjectChoiceTitle,
  inferProjectName,
  inferProjectRemoteUrl,
  isGitRepository,
  markProjectUsed,
  PROJECT_REGISTRY_PATH,
  readProjectRegistry,
  resolveProjectPath,
  sortProjects,
  upsertProjectEntry,
} from './project-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(ROOT_DIR, '.env');

function printUsage() {
  console.log('Maestro project registry');
  console.log('  npm run project:list   # 등록된 프로젝트 보기');
  console.log('  npm run project:add    # 프로젝트 폴더/링크 등록');
  console.log('  npm run project:use    # 등록된 프로젝트를 현재 .env에 연결');
}

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function applyProjectToEnv(project) {
  const currentEnv = readEnvFile(ENV_PATH).values;
  const nextEnv = buildEnvValues({
    ...currentEnv,
    MAIN_REPO_PATH: project.path,
    MAESTRO_PROJECT_NAME: project.name,
    PORT: currentEnv.PORT || '8080',
    HOST: currentEnv.HOST || '127.0.0.1',
    ALLOWED_ORIGINS: currentEnv.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
    MAESTRO_SERVER_TOKEN: currentEnv.MAESTRO_SERVER_TOKEN || '',
    VITE_WS_URL: currentEnv.VITE_WS_URL || `ws://${currentEnv.HOST || '127.0.0.1'}:${currentEnv.PORT || '8080'}`,
  });

  writeEnvFile(ENV_PATH, nextEnv);
}

async function handleList() {
  const projects = sortProjects(readProjectRegistry());
  if (projects.length === 0) {
    console.log('등록된 프로젝트가 없습니다.');
    console.log('다음 명령으로 추가하세요: npm run project:add');
    return;
  }

  console.log(`등록 파일: ${PROJECT_REGISTRY_PATH}`);
  for (const project of projects) {
    console.log(`- ${project.name}`);
    console.log(`  path: ${project.path}`);
    if (project.repoUrl) {
      console.log(`  link: ${project.repoUrl}`);
    }
    console.log(`  last used: ${formatTimestamp(project.lastUsedAt)}`);
  }
}

async function handleAdd() {
  console.log('\n🎼 Maestro 프로젝트 등록\n');

  const responses = await prompts([
    {
      type: 'text',
      name: 'projectPath',
      message: '프로젝트 폴더 경로',
      initial: process.cwd(),
      validate: (value) => {
        const resolvedPath = resolveProjectPath(value);
        if (!resolvedPath) return '프로젝트 폴더 경로를 입력하세요.';
        if (!isGitRepository(resolvedPath)) return 'git 레포 루트 폴더를 입력하세요.';
        return true;
      },
    },
    {
      type: 'text',
      name: 'projectName',
      message: '프로젝트 별칭',
      initial: (prev) => inferProjectName(resolveProjectPath(prev)),
      validate: (value) => String(value || '').trim().length > 0 || '프로젝트 별칭을 입력하세요.',
    },
    {
      type: 'text',
      name: 'repoUrl',
      message: '프로젝트 링크(선택, origin URL 자동 제안)',
      initial: (_, values) => inferProjectRemoteUrl(resolveProjectPath(values.projectPath)),
    },
    {
      type: 'confirm',
      name: 'applyNow',
      message: '지금 이 프로젝트를 .env에 바로 연결할까요?',
      initial: true,
    },
  ], {
    onCancel: () => {
      console.log('\n취소되었습니다.');
      process.exit(1);
    },
  });

  const savedProject = upsertProjectEntry({
    name: responses.projectName,
    path: responses.projectPath,
    repoUrl: responses.repoUrl,
  });

  console.log(`\n등록 완료: ${savedProject.name}`);
  console.log(`  path: ${savedProject.path}`);
  if (savedProject.repoUrl) {
    console.log(`  link: ${savedProject.repoUrl}`);
  }

  if (responses.applyNow) {
    applyProjectToEnv(savedProject);
    markProjectUsed(savedProject.id);
    console.log(`  env : ${ENV_PATH} -> MAIN_REPO_PATH 적용 완료`);
  }
}

async function handleUse() {
  const projects = sortProjects(readProjectRegistry());
  if (projects.length === 0) {
    console.error('등록된 프로젝트가 없습니다. 먼저 npm run project:add 를 실행하세요.');
    process.exit(1);
  }

  const { projectId } = await prompts({
    type: 'select',
    name: 'projectId',
    message: '현재 연결할 프로젝트를 선택하세요',
    choices: projects.map((project) => ({
      title: formatProjectChoiceTitle(project),
      value: project.id,
    })),
  }, {
    onCancel: () => {
      console.log('\n취소되었습니다.');
      process.exit(1);
    },
  });

  const selectedProject = projects.find((project) => project.id === projectId);
  if (!selectedProject) {
    console.error('선택한 프로젝트를 찾을 수 없습니다.');
    process.exit(1);
  }

  applyProjectToEnv(selectedProject);
  markProjectUsed(selectedProject.id);

  console.log(`\n현재 프로젝트 연결 완료: ${selectedProject.name}`);
  console.log(`  path: ${selectedProject.path}`);
  console.log(`  env : ${ENV_PATH}`);
  console.log('  next: npm run start:app');
}

const command = process.argv[2] || 'help';

switch (command) {
  case 'list':
    await handleList();
    break;
  case 'add':
    await handleAdd();
    break;
  case 'use':
    await handleUse();
    break;
  default:
    printUsage();
    process.exit(command === 'help' ? 0 : 1);
}
