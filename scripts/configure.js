#!/usr/bin/env node
// scripts/configure.js
// Maestro Coding — 환경변수(.env) 대화형 설정 스크립트 (Node.js)
//
// 사용법:
//   node scripts/configure.js
//   또는
//   npm run configure

import prompts from 'prompts';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
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
  readProjectRegistry,
  resolveProjectPath,
  sortProjects,
  upsertProjectEntry,
} from './project-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT_DIR, '.env');
const existingEnv = readEnvFile(ENV_FILE).values;
const registeredProjects = sortProjects(readProjectRegistry());

console.log('\n🎼 Maestro Coding — 환경 설정 스크립트 (Node.js)');
console.log('=================================================\n');

if (existsSync(ENV_FILE)) {
  const { overwrite } = await prompts({
    type: 'confirm',
    name: 'overwrite',
    message: '.env 파일이 이미 존재합니다. 덮어쓰시겠습니까?',
    initial: false,
  });
  if (!overwrite) {
    console.log('\n취소되었습니다. 기존 .env 파일을 유지합니다.');
    process.exit(0);
  }
}

let selectedProject = null;
if (registeredProjects.length > 0) {
  const projectChoices = [
    ...registeredProjects.map((project) => ({
      title: formatProjectChoiceTitle(project),
      value: project.id,
    })),
    { title: `현재 폴더 사용 — ${process.cwd()}`, value: '__cwd__' },
    { title: '직접 경로 입력', value: '__manual__' },
  ];

  const { projectSource } = await prompts({
    type: 'select',
    name: 'projectSource',
    message: '연결할 프로젝트를 선택하세요',
    choices: projectChoices,
    initial: 0,
  }, {
    onCancel: () => {
      console.log('\n취소되었습니다.');
      process.exit(1);
    },
  });

  if (projectSource === '__cwd__') {
    selectedProject = {
      name: inferProjectName(process.cwd()),
      path: process.cwd(),
      repoUrl: inferProjectRemoteUrl(process.cwd()),
    };
  } else if (projectSource && projectSource !== '__manual__') {
    selectedProject = registeredProjects.find((project) => project.id === projectSource) || null;
  }
}

const response = await prompts([
  {
    type: 'text',
    name: 'MAIN_REPO_PATH',
    message: 'MAIN_REPO_PATH — git merge를 실행할 레포 경로',
    initial: selectedProject?.path || existingEnv.MAIN_REPO_PATH || process.cwd(),
    validate: (value) => {
      const projectPath = resolveProjectPath(value);
      if (!projectPath) return '레포 경로를 입력하세요.';
      if (!isGitRepository(projectPath)) return 'git 레포 루트 경로를 입력하세요.';
      return true;
    },
  },
  {
    type: prev => {
      const normalizedPath = resolveProjectPath(prev);
      const alreadyRegistered = registeredProjects.some((project) => project.path === normalizedPath);
      return alreadyRegistered ? null : 'confirm';
    },
    name: 'SAVE_PROJECT',
    message: '이 프로젝트를 다음에도 선택할 수 있게 등록할까요?',
    initial: true,
  },
  {
    type: (_, values) => values.SAVE_PROJECT ? 'text' : null,
    name: 'MAESTRO_PROJECT_NAME',
    message: '프로젝트 별칭',
    initial: (_, values) => {
      const normalizedPath = resolveProjectPath(values.MAIN_REPO_PATH);
      return existingEnv.MAESTRO_PROJECT_NAME || inferProjectName(normalizedPath);
    },
  },
  {
    type: (_, values) => values.SAVE_PROJECT ? 'text' : null,
    name: 'PROJECT_REPO_URL',
    message: '프로젝트 링크(선택)',
    initial: (_, values) => inferProjectRemoteUrl(resolveProjectPath(values.MAIN_REPO_PATH)),
  },
  {
    type: 'text',
    name: 'PORT',
    message: 'PORT — 서버 리스닝 포트',
    initial: existingEnv.PORT || '8080',
    validate: (v) => (/^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) < 65536) || '유효한 포트 번호를 입력하세요 (1-65535)',
  },
  {
    type: 'text',
    name: 'HOST',
    message: 'HOST — 서버 바인딩 호스트 (기본: 127.0.0.1)',
    initial: existingEnv.HOST || '127.0.0.1',
  },
  {
    type: 'text',
    name: 'ALLOWED_ORIGINS',
    message: 'ALLOWED_ORIGINS — 허용 Origin 목록 (쉼표 구분)',
    initial: existingEnv.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
  },
  {
    type: 'password',
    name: 'MAESTRO_SERVER_TOKEN',
    message: 'MAESTRO_SERVER_TOKEN — 인증 토큰 (빈 값으로 두면 인증 없음)',
    initial: existingEnv.MAESTRO_SERVER_TOKEN || '',
  },
  {
    type: 'text',
    name: 'VITE_WS_URL',
    message: 'VITE_WS_URL — 프론트엔드가 연결할 WebSocket 주소',
    initial: (_, values) => existingEnv.VITE_WS_URL || `ws://${values.HOST || '127.0.0.1'}:${values.PORT || 8080}`,
  },
], {
  onCancel: () => {
    console.log('\n취소되었습니다.');
    process.exit(1);
  },
});

let projectIdToMark = selectedProject?.id || '';

if (response.SAVE_PROJECT) {
  const savedProject = upsertProjectEntry({
    name: response.MAESTRO_PROJECT_NAME || inferProjectName(response.MAIN_REPO_PATH),
    path: response.MAIN_REPO_PATH,
    repoUrl: response.PROJECT_REPO_URL || '',
  });
  response.MAESTRO_PROJECT_NAME = savedProject.name;
  projectIdToMark = savedProject.id;
} else if (selectedProject?.name) {
  response.MAESTRO_PROJECT_NAME = selectedProject.name;
}

const envValues = buildEnvValues({
  ...existingEnv,
  MAIN_REPO_PATH: response.MAIN_REPO_PATH,
  MAESTRO_PROJECT_NAME: response.MAESTRO_PROJECT_NAME || existingEnv.MAESTRO_PROJECT_NAME || '',
  PORT: response.PORT,
  HOST: response.HOST || '127.0.0.1',
  ALLOWED_ORIGINS: response.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
  MAESTRO_SERVER_TOKEN: response.MAESTRO_SERVER_TOKEN || '',
  VITE_WS_URL: response.VITE_WS_URL,
});

writeEnvFile(ENV_FILE, envValues);
if (projectIdToMark) {
  markProjectUsed(projectIdToMark);
}

console.log(`\n✅ .env 파일이 생성되었습니다: ${ENV_FILE}`);
console.log('\n서버를 시작하려면:');
console.log('  npm run start:app\n');
