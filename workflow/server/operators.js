// 운영자 레지스트리 (스펙 2026-08-04 다중 운영자 §2) — actors.js 미러, heartbeat 없음.
// 토큰은 발급 시 1회만 평문 반환, 레코드에는 sha256 해시만 저장.
import crypto from 'node:crypto';
import { loadStore, saveStore } from './persist.js';
import { sanitizeText } from './actors.js';

const operatorsById = new Map();
let storePath = null;

function generateOperatorToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashOperatorToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function persist() {
  if (storePath) saveStore(storePath, { items: Array.from(operatorsById.values()) });
}

export function initOperatorStore(path) {
  storePath = path;
  operatorsById.clear();
  const data = loadStore(path);
  for (const item of data?.items || []) {
    if (item && typeof item.operatorId === 'string' && item.operatorId) {
      operatorsById.set(item.operatorId, item);
    }
  }
}

// 재등록(upsert) = 무조건 토큰 회전.
export function registerOperator({ operatorId, displayName = '' } = {}) {
  const id = sanitizeText(operatorId, 80);
  if (!id) return null;
  const token = generateOperatorToken();
  const now = new Date().toISOString();
  const existing = operatorsById.get(id) || null;
  const operator = {
    operatorId: id,
    displayName: sanitizeText(displayName, 120),
    tokenHash: hashOperatorToken(token),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  operatorsById.set(id, operator);
  persist();
  return { operator, operatorToken: token };
}

export function findOperatorByToken(token) {
  if (!token) return null;
  const tokenHash = hashOperatorToken(token);
  return (
    Array.from(operatorsById.values()).find((operator) => operator.tokenHash && operator.tokenHash === tokenHash)
    || null
  );
}

export function revokeOperator(operatorId) {
  const operator = operatorsById.get(operatorId);
  if (!operator) return null;
  operator.tokenHash = null;
  operator.updatedAt = new Date().toISOString();
  persist();
  return operator;
}

export function toPublicOperator(operator) {
  if (!operator) return operator;
  const { tokenHash, ...publicOperator } = operator;
  return publicOperator;
}

export function listOperators() {
  return Array.from(operatorsById.values()).map(toPublicOperator);
}
