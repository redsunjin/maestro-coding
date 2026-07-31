// Append-only 감사 이력 (AuditLog). 수정/삭제 API 없음 — 추가와 조회뿐.
import { loadStore, saveStore } from './persist.js';
import { sanitizeText } from './actors.js';

const HISTORY_MAX_ITEMS = 500;
const EVENT_VALUES = new Set([
  'ACTOR_REGISTERED',
  'ACTOR_REVOKED',
  'REQUEST_CREATED',
  'DECIDED',
  'ACKNOWLEDGED',
]);

const entries = [];
let storePath = null;

function persist() {
  if (storePath) saveStore(storePath, { items: entries });
}

export function initHistoryStore(path) {
  storePath = path;
  entries.length = 0;
  const data = loadStore(path);
  for (const item of data?.items || []) {
    if (item && EVENT_VALUES.has(item.event)) entries.push(item);
  }
}

export function appendHistory(input = {}) {
  if (!EVENT_VALUES.has(input.event)) return null;
  const entry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    event: input.event,
    requestId: sanitizeText(input.requestId || '', 80) || null,
    actorId: sanitizeText(input.actorId || '', 80) || null,
    subjectType: sanitizeText(input.subjectType || '', 40) || null,
    title: sanitizeText(input.title || '', 120) || null,
    decision: sanitizeText(input.decision || '', 20) || null,
    comment: sanitizeText(input.comment || '', 400) || null,
    decidedBy: sanitizeText(input.decidedBy || '', 80) || null,
  };
  entries.push(entry);
  while (entries.length > HISTORY_MAX_ITEMS) entries.shift();
  persist();
  return entry;
}

export function listHistory(limit = 40) {
  const normalized = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), HISTORY_MAX_ITEMS) : 40;
  return entries.slice(-normalized).reverse();
}
