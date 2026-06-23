import { useEffect, useState } from 'react';

const WORK_CONSOLE_OPEN_KEY = 'maestro.work-console.open';
const WORK_CONSOLE_DOCK_SIDE_KEY = 'maestro.work-console.dock-side';

function readOpenState() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(WORK_CONSOLE_OPEN_KEY) === 'true';
}

function readDockSide() {
  if (typeof window === 'undefined') return 'right';
  const storedValue = window.localStorage.getItem(WORK_CONSOLE_DOCK_SIDE_KEY);
  return storedValue === 'left' ? 'left' : 'right';
}

export default function useWorkConsoleShell() {
  const [isWorkConsoleOpen, setIsWorkConsoleOpen] = useState(readOpenState);
  const [workConsoleDockSide, setWorkConsoleDockSide] = useState(readDockSide);
  const [selectedWorkSessionId, setSelectedWorkSessionId] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WORK_CONSOLE_OPEN_KEY, String(isWorkConsoleOpen));
  }, [isWorkConsoleOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WORK_CONSOLE_DOCK_SIDE_KEY, workConsoleDockSide);
  }, [workConsoleDockSide]);

  return {
    isWorkConsoleOpen,
    setIsWorkConsoleOpen,
    workConsoleDockSide,
    selectedWorkSessionId,
    setSelectedWorkSessionId,
    toggleWorkConsole: () => setIsWorkConsoleOpen((open) => !open),
    openWorkConsole: () => setIsWorkConsoleOpen(true),
    closeWorkConsole: () => setIsWorkConsoleOpen(false),
    moveWorkConsoleLeft: () => setWorkConsoleDockSide('left'),
    moveWorkConsoleRight: () => setWorkConsoleDockSide('right'),
  };
}
