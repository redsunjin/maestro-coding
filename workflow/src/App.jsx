import { useCallback, useEffect, useState } from 'react';
import ChannelBoard from './components/ChannelBoard.jsx';
import DecisionSheet from './components/DecisionSheet.jsx';
import { WS_URL, decideRequest, fetchPendingRequests } from './lib/api.js';

// Maestro Workflow 대시보드 셸: 대기 요청을 채널 보드로 표시하고 WS로 실시간 갱신.
export default function App() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [connected, setConnected] = useState(false);

  const reload = useCallback(() => {
    fetchPendingRequests().then(setRequests).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WORKFLOW_REQUEST_CREATED' || data.type === 'WORKFLOW_DECIDED') {
          reload();
        }
      } catch {
        // 무시
      }
    };
    return () => ws.close();
  }, [reload]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">🎼 Maestro Workflow</h1>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
          {connected ? '실시간 연결됨' : '연결 대기'}
        </span>
      </header>
      <ChannelBoard requests={requests} onSelect={setSelected} />
      {selected ? (
        <DecisionSheet
          request={selected}
          onClose={() => setSelected(null)}
          onDecide={(decision, comment) => {
            decideRequest(selected.requestId, { decision, comment })
              .catch(() => {})
              .finally(() => {
                setSelected(null);
                reload();
              });
          }}
        />
      ) : null}
    </div>
  );
}
