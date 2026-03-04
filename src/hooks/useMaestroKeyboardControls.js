import { useEffect } from 'react';
import { LANES, PROJECTS } from '../constants/maestro.js';

export default function useMaestroKeyboardControls({
  isPlaying,
  previewNote,
  setPreviewNote,
  setIsBachPanelOpen,
  setIsHistoryPanelOpen,
  setActiveProjectId,
  triggerUndoAction,
  triggerLaneAction,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const eventTarget = event.target;
      const isInputLike = eventTarget instanceof HTMLElement
        && (
          eventTarget.tagName === 'INPUT'
          || eventTarget.tagName === 'TEXTAREA'
          || eventTarget.tagName === 'SELECT'
          || eventTarget.isContentEditable
        );

      if (event.key === 'Escape') {
        setPreviewNote(null);
        setIsBachPanelOpen(false);
        setIsHistoryPanelOpen(false);
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'h' && !isInputLike) {
        event.preventDefault();
        setIsHistoryPanelOpen((open) => !open);
        return;
      }
      if (!isPlaying || previewNote) return;
      if (isInputLike) return;

      const projectIndex = parseInt(key, 10) - 1;
      if (projectIndex >= 0 && projectIndex < PROJECTS.length) {
        setActiveProjectId(PROJECTS[projectIndex].id);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        triggerUndoAction();
        return;
      }

      const laneMatch = LANES.find((lane) => lane.key === key);
      if (!laneMatch) return;

      triggerLaneAction(laneMatch.id, {
        isRejectAction: event.shiftKey,
        promptFeedback: event.shiftKey,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    previewNote,
    setPreviewNote,
    setIsBachPanelOpen,
    setIsHistoryPanelOpen,
    setActiveProjectId,
    triggerUndoAction,
    triggerLaneAction,
  ]);
}
