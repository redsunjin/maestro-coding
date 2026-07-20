import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LANE_COUNT, NOTE_STATUS, SPAWN_BOTTOM, normalizeLaneIndex } from '../constants/maestro.js';

export default function useMaestroRealtime({
  wsUrl,
  activeProjectRef,
  notesRef,
  setNotes,
  setScore,
  setMergedCount,
  setCombo,
  setMaxCombo,
  showFeedback,
  onSocketEvent,
  laneCount = DEFAULT_LANE_COUNT,
}) {
  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState('disconnected');

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setWsStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setWsStatus('connected');
      console.log('🎼 Maestro 서버에 연결됨:', wsUrl);
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setWsStatus('disconnected');
      wsRef.current = null;
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setWsStatus('disconnected');
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof onSocketEvent === 'function') {
          onSocketEvent(data);
        }

        if (data.event === 'AGENT_TASK_READY') {
          const laneIndex = (normalizeLaneIndex(data.laneIndex, laneCount) || 1) - 1;
          const projectId = data.projectId || activeProjectRef.current;

          const newNote = {
            id: data.requestId || (Date.now() + Math.random()),
            requestId: data.requestId,
            branchName: data.branchName || null,
            projectId,
            lane: laneIndex,
            title: data.diffSummary?.title || data.agentId || 'Agent Request',
            diff: data.diffSummary?.shortDescription || '',
            currentBottom: SPAWN_BOTTOM,
            status: NOTE_STATUS.READY,
          };

          setNotes((prev) => {
            const laneNotes = prev.filter((note) => note.lane === laneIndex && note.projectId === projectId);
            if (laneNotes.length >= 6) return prev;
            return [...prev, newNote];
          });
          return;
        }

        if (data.event === 'MERGE_SUCCESS') {
          const mergedNote = notesRef.current.find((note) => note.requestId === data.requestId);
          if (!mergedNote) return;

          setNotes((prev) => prev.filter((note) => note.requestId !== data.requestId));
          // 탭 시점의 타이밍 판정 보상을 머지 성공 시점에 적용 (판정 없으면 기본값)
          setScore((score) => score + (mergedNote.gradeScore ?? 100));
          setMergedCount((count) => count + 1);
          if (mergedNote.gradeComboDelta === 0) {
            setCombo(0);
          } else {
            setCombo((combo) => {
              const nextCombo = combo + (mergedNote.gradeComboDelta ?? 1);
              setMaxCombo((maxCombo) => Math.max(maxCombo, nextCombo));
              return nextCombo;
            });
          }
          showFeedback(mergedNote.projectId, mergedNote.lane, 'MERGED!', 'text-green-400');
          return;
        }

        if (data.event === 'MERGE_FAILED') {
          const failedNote = notesRef.current.find((note) => note.requestId === data.requestId);
          if (!failedNote) return;

          setNotes((prev) => prev.map((note) => (
            note.requestId === data.requestId
              ? { ...note, status: NOTE_STATUS.READY }
              : note
          )));
          setCombo(0);
          showFeedback(failedNote.projectId, failedNote.lane, 'MERGE FAILED', 'text-red-400');
          return;
        }

        if (data.event === 'AGENT_RESTARTED') {
          const rejectedNote = notesRef.current.find((note) => note.requestId === data.requestId);
          if (!rejectedNote) return;

          setNotes((prev) => prev.filter((note) => note.requestId !== data.requestId));
          setCombo(0);
          showFeedback(rejectedNote.projectId, rejectedNote.lane, 'REJECTED', 'text-orange-300');
          return;
        }

        if (data.event === 'UNDO_SUCCESS') {
          setScore((score) => Math.max(0, score - 100));
          setMergedCount((count) => Math.max(0, count - 1));
          setCombo(0);
          showFeedback(activeProjectRef.current, -1, '⏪ ROLLBACK OK', 'text-yellow-400');
          return;
        }

        if (data.event === 'UNDO_FAILED') {
          showFeedback(activeProjectRef.current, -1, 'UNDO FAILED', 'text-red-400');
        }
      } catch {
        // ignore parse errors
      }
    };
  }, [
    wsUrl,
    activeProjectRef,
    notesRef,
    setNotes,
    setScore,
    setCombo,
    setMaxCombo,
    showFeedback,
    onSocketEvent,
    laneCount,
  ]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
  }, []);

  const sendSocketAction = useCallback((payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    wsRef.current.send(JSON.stringify(payload));
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    wsStatus,
    connectWebSocket,
    disconnectWebSocket,
    sendSocketAction,
  };
}
