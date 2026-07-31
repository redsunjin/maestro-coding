// Maestro Workflow 결정 서버 (Maestro Harmony).
// 범용 DecisionRequest를 수신해 사람이 결정하고, record-only로 기록·전달한다.
// 실행: node server.js  (기본 http://127.0.0.1:8090)
import http from 'node:http';
import { PORT, HOST, ALLOWED_ORIGINS } from './server/config.js';

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

const server = http.createServer((req, res) => {
  applyCors(req, res);
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: 0 });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, HOST, () => {
  console.log(`🎼 Maestro Workflow server on http://${HOST}:${PORT}`);
});
