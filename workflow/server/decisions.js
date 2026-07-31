// DecisionRequest / Decision 스토어 (본체 ApprovalRequest/Decision의 일반화).
// subjectType은 자유 문자열 — 서버는 유형을 등록제로 제한하지 않는다 (record-only라 안전).
import { loadStore, saveStore } from './persist.js';
import { sanitizeText } from './actors.js';

const requestsById = new Map();
const decisionsByRequestId = new Map();
let storePath = null;

function persist() {
  if (!storePath) return;
  saveStore(storePath, {
    requests: Array.from(requestsById.values()),
    decisions: Array.from(decisionsByRequestId.values()),
  });
}

export function initDecisionStore(path) {
  storePath = path;
  requestsById.clear();
  decisionsByRequestId.clear();
  const data = loadStore(path);
  for (const item of data?.requests || []) {
    if (item && typeof item.requestId === 'string' && item.requestId) {
      requestsById.set(item.requestId, item);
    }
  }
  for (const item of data?.decisions || []) {
    if (item && typeof item.requestId === 'string' && item.requestId) {
      decisionsByRequestId.set(item.requestId, item);
    }
  }
}

export function createDecisionRequest({ actorId, subjectType, subject = {}, source = 'agent' } = {}) {
  const type = sanitizeText(subjectType, 40).toLowerCase();
  if (!type) {
    const error = new Error('SUBJECT_TYPE_REQUIRED');
    error.code = 'SUBJECT_TYPE_REQUIRED';
    throw error;
  }
  const title = sanitizeText(subject?.title, 120);
  if (!title) {
    const error = new Error('SUBJECT_TITLE_REQUIRED');
    error.code = 'SUBJECT_TITLE_REQUIRED';
    throw error;
  }
  const now = new Date().toISOString();
  const request = {
    requestId: `dcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    actorId: sanitizeText(actorId, 80) || 'unknown',
    subjectType: type,
    subject: {
      title,
      summary: sanitizeText(subject?.summary, 400),
      payload:
        subject?.payload && typeof subject.payload === 'object' && !Array.isArray(subject.payload)
          ? subject.payload
          : {},
    },
    status: 'pending_decision',
    source: sanitizeText(source, 20) || 'agent',
    createdAt: now,
    updatedAt: now,
  };
  requestsById.set(request.requestId, request);
  persist();
  return request;
}

export function getRequest(requestId) {
  return requestsById.get(requestId) || null;
}

export function listRequests({ status = null } = {}) {
  const items = Array.from(requestsById.values());
  const filtered = status ? items.filter((item) => item.status === status) : items;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countPendingRequests() {
  return listRequests({ status: 'pending_decision' }).length;
}
