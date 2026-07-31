import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function registerActor(server, actorId, token = SERVER_TOKEN) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId, displayName: `Actor ${actorId}`, actorType: 'agent' }),
  });
  return { res, body: res.status === 200 ? await res.json() : await res.json().catch(() => ({})) };
}

test('register issues one-time token and stores only hash', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const { res, body } = await registerActor(server, 'agent_a');
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.match(body.actorToken, /^[0-9a-f]{48}$/);
    assert.equal(body.item.actorId, 'agent_a');
    assert.equal(body.item.tokenHash, undefined);

    const listRes = await fetch(`http://127.0.0.1:${server.port}/api/actors`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    const list = await listRes.json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].tokenHash, undefined);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('register requires server token; heartbeat requires matching actor token', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const denied = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: 'agent_x' }),
    });
    assert.equal(denied.status, 401);

    const { body: a } = await registerActor(server, 'agent_a');
    const { body: b } = await registerActor(server, 'agent_b');

    const ok = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(a.actorToken),
    });
    assert.equal(ok.status, 200);

    // 남의 토큰으로 heartbeat → 403 (id 불일치)
    const mismatch = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(b.actorToken),
    });
    assert.equal(mismatch.status, 403);

    // 서버 토큰은 actor 엔드포인트에서 grace 통과되지 않는다 (엄격 모드 전용)
    const graceDenied = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(graceDenied.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('revoke invalidates token; re-register rotates it; store survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const { body: a } = await registerActor(first, 'agent_a');

    const revoke = await fetch(`http://127.0.0.1:${first.port}/api/actors/agent_a/revoke`, {
      method: 'POST',
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(revoke.status, 200);

    const afterRevoke = await fetch(`http://127.0.0.1:${first.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(a.actorToken),
    });
    assert.equal(afterRevoke.status, 401);

    // 재등록 = 토큰 회전
    const { body: rotated } = await registerActor(first, 'agent_a');
    assert.notEqual(rotated.actorToken, a.actorToken);

    await first.stop();

    // 같은 dataDir로 재시작 → 회전된 토큰이 계속 유효
    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const alive = await fetch(`http://127.0.0.1:${second.port}/api/actors/agent_a/heartbeat`, {
        method: 'POST',
        headers: authHeaders(rotated.actorToken),
      });
      assert.equal(alive.status, 200);
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});
