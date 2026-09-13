#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.MAESTRO_AGENTSVIEW_URL || 'http://127.0.0.1:8080';
const DEFAULT_TIMEOUT_MS = Number(process.env.MAESTRO_AGENTSVIEW_TIMEOUT_MS || 1500);

function parseArgs(argv) {
  const args = {
    sessionId: '',
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 1500,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--session-id') args.sessionId = argv[++i] || '';
    else if (value === '--base-url') args.baseUrl = argv[++i] || DEFAULT_BASE_URL;
    else if (value === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
  }

  return args;
}

async function fetchJson(url, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function filterRecentEditsBySession(payload, sessionId) {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const matched = [];

  for (const file of files) {
    const edits = Array.isArray(file?.edits) ? file.edits : [];
    const sessionEdits = edits.filter((edit) => edit?.session_id === sessionId);
    if (sessionEdits.length === 0) continue;
    matched.push({
      project: file.project || null,
      filePath: file.file_path || null,
      editCount: sessionEdits.length,
      edits: sessionEdits,
    });
  }

  return matched;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sessionId) {
    console.error('Usage: node scripts/spike-agentsview-observation.mjs --session-id <agentsview-session-id> [--base-url http://127.0.0.1:8080]');
    process.exit(2);
  }

  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const encodedSessionId = encodeURIComponent(args.sessionId);

  const summary = {
    provider: 'agentsview',
    baseUrl,
    externalSessionId: args.sessionId,
    availability: 'unknown',
    session: null,
    usage: null,
    exactSessionEdits: [],
    notes: [],
  };

  let sessionResponse;
  try {
    sessionResponse = await fetchJson(`${baseUrl}/api/v1/sessions/${encodedSessionId}`, args);
  } catch (error) {
    summary.availability = error?.name === 'AbortError' ? 'timeout' : 'unavailable';
    summary.notes.push(`session lookup failed: ${error?.message || String(error)}`);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  summary.availability = 'connected';
  if (!sessionResponse.ok) {
    summary.notes.push(`session lookup returned HTTP ${sessionResponse.status}`);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  summary.session = sessionResponse.body;

  try {
    const usageResponse = await fetchJson(`${baseUrl}/api/v1/sessions/${encodedSessionId}/usage`, args);
    if (usageResponse.ok) summary.usage = usageResponse.body;
    else summary.notes.push(`usage lookup returned HTTP ${usageResponse.status}`);
  } catch (error) {
    summary.notes.push(`usage lookup degraded: ${error?.name === 'AbortError' ? 'timeout' : error?.message || String(error)}`);
  }

  const project = sessionResponse.body?.project;
  if (project) {
    try {
      const recentUrl = new URL(`${baseUrl}/api/v1/recent-edits`);
      recentUrl.searchParams.set('project', project);
      recentUrl.searchParams.set('limit', '100');
      recentUrl.searchParams.set('offset', '0');
      const recentResponse = await fetchJson(recentUrl.toString(), args);
      if (recentResponse.ok) {
        summary.exactSessionEdits = filterRecentEditsBySession(recentResponse.body, args.sessionId);
        if (summary.exactSessionEdits.length === 0) {
          summary.notes.push('no exact-session edits found in the first project-level Recent Edits page; this is not proof that the session made no edits');
        }
      } else {
        summary.notes.push(`recent-edits lookup returned HTTP ${recentResponse.status}`);
      }
    } catch (error) {
      summary.notes.push(`recent-edits lookup degraded: ${error?.name === 'AbortError' ? 'timeout' : error?.message || String(error)}`);
    }
  } else {
    summary.notes.push('session metadata did not expose project; skipped Recent Edits probe');
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
