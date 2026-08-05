import { useCallback, useEffect, useState } from 'react';
import ChannelBoard from './components/ChannelBoard.jsx';
import DecisionSheet from './components/DecisionSheet.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import TokenGate from './components/TokenGate.jsx';
import {
  WS_URL,
  decideRequest,
  fetchHistory,
  fetchPendingRequests,
  fetchRequestChain,
  getServerToken,
  loadServerToken,
  setServerToken,
} from './lib/api.js';

const MAX_RECONNECT_DELAY_MS = 15000;

// Maestro Workflow 대시보드 셸: 채널 보드 + WS 실시간 갱신 + 엄격 모드 토큰 게이트.
export default function App() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [connected, setConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [authRequired, setAuthRequired] = useState(false);
  const [wsEpoch, setWsEpoch] = useState(0);
  useState(() => loadServerToken());

  const reload = useCallback(() => {
    fetchPendingRequests()
      .then(setRequests)
      .catch((error) => {
        if (error && error.code === 'UNAUTHORIZED') setAuthRequired(true);
      });
    fetchHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    let disposed = false;
    let ws = null;
    let reconnectTimer = null;
    let attempt = 0;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: getServerToken() }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'WORKFLOW_AUTH_OK') {
            attempt = 0;
            setConnected(true);
            reload(); // 끊김 동안의 변경분 재동기화
            return;
          }
          if (
            data.type === 'WORKFLOW_REQUEST_CREATED'
            || data.type === 'WORKFLOW_DECIDED'
            || data.type === 'WORKFLOW_HISTORY_APPEND'
          ) {
            reload();
          }
        } catch {
          // 무시
        }
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (disposed) return;
        if (event && event.code === 4401) {
          setAuthRequired(true);
          return;
        }
        const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [reload, wsEpoch]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">🎼 Maestro Workflow</h1>
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="min-h-[44px] rounded-lg bg-slate-800 px-4 text-sm transition active:scale-95"
        >
          {showHistory ? '보드' : '이력'}
        </button>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
          {connected ? '실시간 연결됨' : '연결 대기'}
        </span>
      </header>
      {showHistory ? (
        <HistoryPanel entries={history} />
      ) : (
        <ChannelBoard
          requests={requests}
          onSelect={(request) => {
            setSelected(request);
            setSelectedChain(null);
            if (request.parentRequestId) {
              // 체인 로드는 논블로킹 — 도착하는 대로 시트에 타임라인 표시 (스펙 2026-08-05 §1)
              fetchRequestChain(request.requestId).then(setSelectedChain).catch(() => {});
            }
          }}
        />
      )}
      {selected ? (
        <DecisionSheet
          request={selected}
          chain={selectedChain}
          onClose={() => {
            setSelected(null);
            setSelectedChain(null);
          }}
          onDecide={(decision, comment) => {
            decideRequest(selected.requestId, { decision, comment })
              .catch(() => {})
              .finally(() => {
                setSelected(null);
                setSelectedChain(null);
                reload();
              });
          }}
        />
      ) : null}
      {authRequired ? (
        <TokenGate
          onSubmit={(token) => {
            setServerToken(token);
            setAuthRequired(false);
            setWsEpoch((value) => value + 1); // effect 재실행 → 재조회 + WS 재접속
          }}
        />
      ) : null}
    </div>
  );
}
