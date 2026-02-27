#!/usr/bin/env node
// scripts/configure.js — .env 파일 대화형 설정 스크립트 (Node.js / prompts)
import prompts from 'prompts';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const envFile = resolve(rootDir, '.env');
const exampleFile = resolve(rootDir, '.env.example');

if (existsSync(envFile)) {
  const { overwrite } = await prompts({
    type: 'confirm',
    name: 'overwrite',
    message: '.env 파일이 이미 존재합니다. 덮어쓰시겠습니까?',
    initial: false,
  });
  if (!overwrite) {
    console.log('취소되었습니다.');
    process.exit(0);
  }
}

const response = await prompts([
  {
    type: 'text',
    name: 'MAIN_REPO_PATH',
    message: 'git merge를 수행할 메인 레포지토리의 로컬 경로를 입력하세요',
    initial: process.env.MAIN_REPO_PATH || '',
    validate: (v) => v.trim() !== '' || '경로는 필수입니다.',
  },
  {
    type: 'text',
    name: 'PORT',
    message: '서버 포트를 입력하세요',
    initial: '8080',
  },
  {
    type: 'text',
    name: 'VITE_WS_URL',
    message: 'WebSocket URL을 입력하세요',
    initial: 'ws://localhost:8080',
  },
  {
    type: 'password',
    name: 'MAESTRO_SERVER_TOKEN',
    message: 'API 인증 토큰을 입력하세요 (선택, 비워두면 인증 비활성화)',
    initial: '',
  },
]);

// Read example as base then overwrite values
let content = readFileSync(exampleFile, 'utf8');
for (const [key, value] of Object.entries(response)) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  content = content.replace(new RegExp(`^${escapedKey}=.*`, 'm'), `${key}=${value}`);
}

writeFileSync(envFile, content, 'utf8');
console.log(`\n.env 파일이 저장되었습니다: ${envFile}`);
