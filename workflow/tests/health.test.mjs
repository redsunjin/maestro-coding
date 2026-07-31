import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir } from './helpers.mjs';

test('GET /health responds with app identity and pending count', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.app, 'maestro-workflow');
    assert.equal(body.pendingRequests, 0);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
