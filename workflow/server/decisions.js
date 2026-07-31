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

export const DECISION_VALUES = new Set(['approve', 'reject', 'revise', 'ask', 'cancel']);

// record-only: executorAction은 항상 'none'. Workflow는 아무것도 실행하지 않는다.
export function decideRequest(requestId, { decision, comment = '', decidedBy = 'operator' } = {}) {
  const request = requestsById.get(requestId);
  if (!request) return { error: 'DECISION_REQUEST_NOT_FOUND', status: 404 };
  if (decisionsByRequestId.has(requestId)) return { error: 'ALREADY_DECIDED', status: 409 };
  if (!DECISION_VALUES.has(decision)) return { error: 'INVALID_DECISION', status: 400 };

  const now = new Date().toISOString();
  const item = {
    decisionId: `dcd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    requestId,
    decision,
    comment: sanitizeText(comment, 400),
    executorAction: 'none',
    delivery: { mode: 'pull', status: 'available', acknowledgedAt: null },
    decidedBy: sanitizeText(decidedBy, 80) || 'operator',
    createdAt: now,
  };
  decisionsByRequestId.set(requestId, item);
  request.status = 'decided';
  request.updatedAt = now;
  persist();
  return { item, request };
}

export function getDecisionByRequestId(requestId) {
  return decisionsByRequestId.get(requestId) || null;
}

export function findRequestByDecisionId(decisionId) {
  for (const decision of decisionsByRequestId.values()) {
    if (decision.decisionId === decisionId) return requestsById.get(decision.requestId) || null;
  }
  return null;
}

export function acknowledgeDecision(decisionId) {
  const decision =
    Array.from(decisionsByRequestId.values()).find((item) => item.decisionId === decisionId) || null;
  if (!decision) return null;
  if (decision.delivery.status !== 'acknowledged') {
    decision.delivery.status = 'acknowledged';
    decision.delivery.acknowledgedAt = new Date().toISOString();
    persist();
  }
  return decision;
}
