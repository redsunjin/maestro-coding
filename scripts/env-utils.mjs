import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173';
export const DEFAULT_ENV_HEADER_LINES = [
  '# Maestro Coding — 환경변수 (자동 생성)',
  '# ⚠️ 이 파일은 절대 Git에 커밋하지 마세요!',
  '',
];

const ENV_KEY_ORDER = [
  'MAESTRO_PROJECT_NAME',
  'MAESTRO_PROJECT_LANE_COUNT',
  'MAIN_REPO_PATH',
  'PORT',
  'HOST',
  'ALLOWED_ORIGINS',
  'MAESTRO_SERVER_TOKEN',
  'VITE_WS_URL',
  'MAESTRO_AUTO_APPROVE_ENABLED',
  'MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS',
  'MAESTRO_AUTO_APPROVE_BRANCH_PREFIX',
  'MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH',
  'MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT',
  'MAESTRO_AUTO_APPROVE_COOLDOWN_MS',
  'MAESTRO_AUTO_APPROVE_DRY_RUN',
  'MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS',
  'MAESTRO_HISTORY_MAX_ITEMS',
];

export function parseEnvContent(content) {
  const values = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = rawLine.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function readEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) {
    return { found: false, values: {} };
  }

  const content = readFileSync(envFilePath, 'utf8');
  return { found: true, values: parseEnvContent(content) };
}

function formatEnvValue(value) {
  return String(value ?? '');
}

export function buildEnvValues(partialValues = {}) {
  const host = String(partialValues.HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = String(partialValues.PORT || '8080').trim() || '8080';

  return {
    PORT: port,
    HOST: host,
    ALLOWED_ORIGINS: DEFAULT_ALLOWED_ORIGINS,
    MAESTRO_SERVER_TOKEN: '',
    VITE_WS_URL: `ws://${host}:${port}`,
    ...partialValues,
  };
}

export function serializeEnvValues(values, { headerLines = DEFAULT_ENV_HEADER_LINES } = {}) {
  const lines = [...headerLines];
  const seenKeys = new Set();

  for (const key of ENV_KEY_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    seenKeys.add(key);
    lines.push(`${key}=${formatEnvValue(values[key])}`);
  }

  const extraKeys = Object.keys(values)
    .filter((key) => !seenKeys.has(key))
    .sort((left, right) => left.localeCompare(right));

  for (const key of extraKeys) {
    lines.push(`${key}=${formatEnvValue(values[key])}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function writeEnvFile(envFilePath, values, options = {}) {
  const content = serializeEnvValues(values, options);
  writeFileSync(envFilePath, content, 'utf8');
}
