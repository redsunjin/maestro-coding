#!/usr/bin/env node
// scripts/configure.js
// Maestro Coding — 환경변수(.env) 대화형 설정 스크립트 (Node.js)
//
// 사용법:
//   node scripts/configure.js
//   또는
//   npm run configure

import prompts from 'prompts';
import { existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT_DIR, '.env');
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173';

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

const response = await prompts(
  [
    {
      type: 'text',
      name: 'MAIN_REPO_PATH',
      message: 'MAIN_REPO_PATH — git merge를 실행할 레포 경로',
      initial: process.cwd(),
    },
    {
      type: 'text',
      name: 'PORT',
      message: 'PORT — 서버 리스닝 포트',
      initial: '8080',
      validate: (v) => (/^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) < 65536) || '유효한 포트 번호를 입력하세요 (1-65535)',
    },
    {
      type: 'text',
      name: 'HOST',
      message: 'HOST — 서버 바인딩 호스트 (기본: 127.0.0.1)',
      initial: '127.0.0.1',
    },
    {
      type: 'text',
      name: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS — 허용 Origin 목록 (쉼표 구분)',
      initial: DEFAULT_ALLOWED_ORIGINS,
    },
    {
      type: 'password',
      name: 'MAESTRO_SERVER_TOKEN',
      message: 'MAESTRO_SERVER_TOKEN — 인증 토큰 (빈 값으로 두면 인증 없음)',
    },
    {
      type: 'text',
      name: 'VITE_WS_URL',
      message: 'VITE_WS_URL — 프론트엔드가 연결할 WebSocket 주소',
      initial: (_, values) => `ws://${values.HOST || '127.0.0.1'}:${values.PORT || 8080}`,
    },
  ],
  {
    onCancel: () => {
      console.log('\n취소되었습니다.');
      process.exit(1);
    },
  }
);

const envContent = [
  '# Maestro Coding — 환경변수 (자동 생성)',
  '# ⚠️ 이 파일은 절대 Git에 커밋하지 마세요!',
  '',
  `MAIN_REPO_PATH=${response.MAIN_REPO_PATH}`,
  `PORT=${response.PORT}`,
  `HOST=${response.HOST || '127.0.0.1'}`,
  `ALLOWED_ORIGINS=${response.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS}`,
  `MAESTRO_SERVER_TOKEN=${response.MAESTRO_SERVER_TOKEN || ''}`,
  `VITE_WS_URL=${response.VITE_WS_URL}`,
  '',
].join('\n');

writeFileSync(ENV_FILE, envContent, 'utf8');

console.log(`\n✅ .env 파일이 생성되었습니다: ${ENV_FILE}`);
console.log('\n서버를 시작하려면:');
console.log('  npm run server\n');
