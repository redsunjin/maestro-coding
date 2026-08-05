// 인증 경계 (스펙 §3): 서버 토큰(운영자) vs actor 토큰(요청자).
// 본체와 달리 grace 경로 없음 — 엄격 per-actor 전용.
import { SERVER_TOKEN } from './config.js';
import { findActorByToken } from './actors.js';
import { findOperatorByToken } from './operators.js';

export function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const prefix = 'Bearer ';
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token || null;
}

export function isServerAuthorized(req) {
  if (!SERVER_TOKEN) return true;
  return extractBearerToken(req.headers.authorization) === SERVER_TOKEN;
}

// 운영자급 인가 (스펙 2026-08-04 다중 운영자 §1): root(서버 토큰) 또는 개별 운영자 토큰.
export function resolveOperatorAuth(req) {
  if (!SERVER_TOKEN) return { ok: true, mode: 'open', operatorId: null };
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  if (token === SERVER_TOKEN) return { ok: true, mode: 'root', operatorId: 'root' };
  const operator = findOperatorByToken(token);
  if (operator) return { ok: true, mode: 'operator', operatorId: operator.operatorId };
  return { ok: false, status: 401, error: 'Unauthorized' };
}

export function resolveActorAuth(req) {
  if (!SERVER_TOKEN) return { ok: true, mode: 'open', actorId: null };
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const actor = findActorByToken(token);
  if (actor) return { ok: true, mode: 'actor', actorId: actor.actorId };
  return { ok: false, status: 401, error: 'Unauthorized' };
}

// expectedActorId가 주어지면 토큰 주인과의 일치를 검증한다 (open 모드는 제외).
// 실패 시 응답을 직접 쓰고 null을 반환한다.
export function authorizeActor(req, res, expectedActorId = null) {
  const auth = resolveActorAuth(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.error }));
    return null;
  }
  if (auth.mode === 'actor' && expectedActorId && auth.actorId !== expectedActorId) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ACTOR_MISMATCH' }));
    return null;
  }
  return auth;
}
