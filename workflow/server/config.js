// Maestro Workflow 서버 설정. 모든 값은 env로 재정의 가능 (테스트 격리 포함).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const PORT = Number(process.env.MAESTRO_WORKFLOW_PORT || 8090);
export const HOST = process.env.MAESTRO_WORKFLOW_HOST || '127.0.0.1';
export const SERVER_TOKEN = process.env.MAESTRO_WORKFLOW_SERVER_TOKEN || '';
export const WS_AUTH_TIMEOUT_MS = Number(process.env.MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS || 5000);

export const ACTOR_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_ACTOR_STORE_PATH || '.maestro-workflow-actors.json',
);
export const DECISION_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_DECISION_STORE_PATH || '.maestro-workflow-decisions.json',
);
export const HISTORY_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_HISTORY_STORE_PATH || '.maestro-workflow-history.json',
);
export const OPERATOR_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_OPERATOR_STORE_PATH || '.maestro-workflow-operators.json',
);

export const ALLOWED_ORIGINS = (
  process.env.MAESTRO_WORKFLOW_ALLOWED_ORIGINS
  || 'http://localhost:5273,http://127.0.0.1:5273'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
