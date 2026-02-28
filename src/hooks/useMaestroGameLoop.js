import { useCallback, useEffect, useRef } from 'react';
import {
  BASE_BOTTOM,
  NOTE_HEIGHT_OFFSET,
  NOTE_SPEED,
  SPAWN_BOTTOM,
  NOTE_STATUS,
  MOCK_COMMITS,
  PROJECTS,
} from '../constants/maestro.js';

export default function useMaestroGameLoop({ isPlaying, wsStatus, setNotes }) {
  const requestRef = useRef();

  const updateGame = useCallback(() => {
    if (!isPlaying) return;

    setNotes((prevNotes) => {
      const counts = {};
      let hasChanges = false;

      const newNotes = prevNotes.map((note) => {
        const key = `${note.projectId}_${note.lane}`;
        counts[key] = counts[key] || 0;
        const index = counts[key];
        counts[key] += 1;

        const targetBottom = BASE_BOTTOM + (index * NOTE_HEIGHT_OFFSET);
        if (note.currentBottom > targetBottom) {
          hasChanges = true;
          let nextBottom = note.currentBottom - NOTE_SPEED;
          if (nextBottom < targetBottom) nextBottom = targetBottom;
          return { ...note, currentBottom: nextBottom };
        }
        return note;
      });

      return hasChanges ? newNotes : prevNotes;
    });

    requestRef.current = requestAnimationFrame(updateGame);
  }, [isPlaying, setNotes]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateGame);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, updateGame]);

  useEffect(() => {
    if (!isPlaying || wsStatus === 'connected') return;

    let timeoutId;
    const spawnNote = () => {
      const laneIndex = Math.floor(Math.random() * 4);
      const commitData = MOCK_COMMITS[Math.floor(Math.random() * MOCK_COMMITS.length)];
      const randomProjectId = PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id;

      setNotes((prev) => {
        const laneNotes = prev.filter((note) => note.lane === laneIndex && note.projectId === randomProjectId);
        if (laneNotes.length >= 6) return prev;

        const newNote = {
          id: Date.now() + Math.random(),
          projectId: randomProjectId,
          lane: laneIndex,
          title: commitData.title,
          diff: commitData.diff,
          currentBottom: SPAWN_BOTTOM,
          status: NOTE_STATUS.READY,
        };
        return [...prev, newNote];
      });

      const nextTime = Math.random() * 1000 + 400;
      timeoutId = setTimeout(spawnNote, nextTime);
    };

    timeoutId = setTimeout(spawnNote, 1000);
    return () => clearTimeout(timeoutId);
  }, [isPlaying, wsStatus, setNotes]);
}
