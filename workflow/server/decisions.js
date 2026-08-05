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

export function createDecisionRequest({ actorId, subjectType, subject = {}, source = 'agent', parentRequestId = null } = {}) {
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
  // 요청 체인 (스펙 2026-08-04 §2): 부모는 반드시 실존해야 한다
  const parentId = sanitizeText(parentRequestId, 60) || null;
  if (parentId && !requestsById.has(parentId)) {
    const error = new Error('PARENT_REQUEST_NOT_FOUND');
    error.code = 'PARENT_REQUEST_NOT_FOUND';
    throw error;
  }

  const now = new Date().toISOString();
  const request = {
    requestId: `dcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    parentRequestId: parentId,
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

// 체인 전체 조회: 루트까지 조상 추적 후 자손 포함, createdAt 오름차순 (스펙 2026-08-04 §2).
export function listRequestChain(requestId) {
  const start = requestsById.get(requestId);
  if (!start) {
    return null;
  }

  let root = start;
  const visited = new Set([root.requestId]);
  while (root.parentRequestId && requestsById.has(root.parentRequestId) && !visited.has(root.parentRequestId)) {
    root = requestsById.get(root.parentRequestId);
    visited.add(root.requestId);
  }

  const chain = [];
  const queue = [root.requestId];
  const included = new Set();
  while (queue.length) {
    const currentId = queue.shift();
    if (included.has(currentId)) continue;
    included.add(currentId);
    const current = requestsById.get(currentId);
    if (!current) continue;
    chain.push(current);
    for (const candidate of requestsById.values()) {
      if (candidate.parentRequestId === currentId && !included.has(candidate.requestId)) {
        queue.push(candidate.requestId);
      }
    }
  }

  return chain.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
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
