import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  WS_URL,
  PROJECTS,
  BASE_BOTTOM,
  NOTE_STATUS,
  DEFAULT_LANE_COUNT,
  LANE_HIT_FREQS,
  getLaneDefinitions,
} from './constants/maestro.js';
import { ensureSfxAudioContext, playBeep, playGradeBeep } from './utils/audio.js';
import { gradeHit, JUDGMENT_GRADE_COLORS, JUDGMENT_GRADE_FLASH_COLORS } from './utils/judgment.js';
import { HAPTIC_PATTERNS, vibrate } from './utils/haptics.js';
import useMaestroRealtime from './hooks/useMaestroRealtime.js';
import useMaestroGameLoop from './hooks/useMaestroGameLoop.js';
import useMaestroKeyboardControls from './hooks/useMaestroKeyboardControls.js';
import useApprovalHistory from './hooks/useApprovalHistory.js';
import useAutoApproveOps from './hooks/useAutoApproveOps.js';
import useBachPlayer from './hooks/useBachPlayer.js';
import useProjectRegistryOps from './hooks/useProjectRegistryOps.js';
import useWorkConsoleShell from './hooks/useWorkConsoleShell.js';
import useWorkSessions from './hooks/useWorkSessions.js';
import useWorkRequests from './hooks/useWorkRequests.js';
import useAgentRegistry from './hooks/useAgentRegistry.js';
import MaestroHeader from './components/maestro/MaestroHeader.jsx';
import ProjectTabs from './components/maestro/ProjectTabs.jsx';
import LaneBoard from './components/maestro/LaneBoard.jsx';
import FooterHelp from './components/maestro/FooterHelp.jsx';
import PreviewModal from './components/maestro/PreviewModal.jsx';
import RejectSheet from './components/maestro/RejectSheet.jsx';
import HistoryScorePanel from './components/maestro/HistoryScorePanel.jsx';
import AutoApproveOpsPanel from './components/maestro/AutoApproveOpsPanel.jsx';
import ProjectRegistryPanel from './components/maestro/ProjectRegistryPanel.jsx';
import WorkConsolePanel from './components/maestro/WorkConsolePanel.jsx';
import WorkRequestPanel from './components/maestro/WorkRequestPanel.jsx';

export default function App() {
  const headerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [panelTopOffset, setPanelTopOffset] = useState(92);
  const [activeProjectId, setActiveProjectId] = useState(PROJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [score, setScore] = useState(0);
  const [mergedCount, setMergedCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [sfxBursts, setSfxBursts] = useState([]);
  const [lineFlashes, setLineFlashes] = useState([]);
  const [previewNote, setPreviewNote] = useState(null);
  const [rejectSheet, setRejectSheet] = useState(null);

  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    activeProjectRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    const headerNode = headerRef.current;
    if (!headerNode) return undefined;

    const updatePanelTopOffset = () => {
      const nextHeight = Math.ceil(headerNode.getBoundingClientRect().height);
      setPanelTopOffset(nextHeight + 12);
    };

    updatePanelTopOffset();

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updatePanelTopOffset();
      });
      resizeObserver.observe(headerNode);
    }

    window.addEventListener('resize', updatePanelTopOffset);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePanelTopOffset);
    };
  }, []);

  const showFeedback = useCallback((projectId, lane, text, color) => {
    const id = Date.now() + Math.random();
    setFeedbacks((prev) => [...prev, { id, projectId, lane, text, color }]);
    setTimeout(() => {
      setFeedbacks((prev) => prev.filter((feedback) => feedback.id !== id));
    }, 500);
  }, []);

  // 콤보 10단위 달성 축하 햅틱 (모크/실시간 경로 공통)
  useEffect(() => {
    if (combo > 0 && combo % 10 === 0) {
      vibrate(HAPTIC_PATTERNS.COMBO_MILESTONE);
    }
  }, [combo]);

  const showLineFlash = useCallback((projectId, lane, colorClass) => {
    const id = Date.now() + Math.random();
    setLineFlashes((prev) => [...prev, { id, projectId, lane, colorClass }]);
    setTimeout(() => {
      setLineFlashes((prev) => prev.filter((flash) => flash.id !== id));
    }, 320);
  }, []);

  const showSfxBurst = useCallback((lane, freq) => {
    const id = Date.now() + Math.random();
    setSfxBursts((prev) => [...prev, { id, lane, label: `${freq.toFixed(2)}Hz` }]);
    setTimeout(() => {
      setSfxBursts((prev) => prev.filter((effect) => effect.id !== id));
    }, 280);
  }, []);

  const {
    youtubeUrlHelpText,
    bachPlayerHostRef,
    bachChannelInput,
    setBachChannelInput,
    bachVolume,
    isBachReady,
    isBachPlaying,
    isBachPlaybackRequested,
    bachVizHz,
    bachPlayerStateCode,
    bachStatusLabel,
    bachHzLabel,
    isBachPanelOpen,
    setIsBachPanelOpen,
    bachError,
    toggleBachPlayback,
    handleBachVolumeChange,
    handleBachPanelToggle,
    handleBachPanelClose,
    saveBachChannel,
    resetBachChannel,
  } = useBachPlayer();

  const {
    visibleHistoryItems,
    historyItems,
    historyError,
    isHistoryLoading,
    isHistoryPanelOpen,
    setIsHistoryPanelOpen,
    historyProjectFilter,
    setHistoryProjectFilter,
    historyResultFilter,
    setHistoryResultFilter,
    historySourceFilter,
    setHistorySourceFilter,
    hasMoreHistoryItems,
    loadMoreHistory,
    filteredHistoryCount,
    historyBadgeCount,
    handleSocketEvent: handleHistorySocketEvent,
  } = useApprovalHistory({
    wsUrl: WS_URL,
  });

  const {
    projectItems,
    currentProject,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectLaneCount,
    setSelectedProjectLaneCount,
    projectError,
    isProjectLoading,
    isProjectApplying,
    isProjectUpdating,
    isProjectPanelOpen,
    setIsProjectPanelOpen,
    projectTokenInput,
    setProjectTokenInput,
    saveProjectToken,
    clearProjectToken,
    isProjectAuthRequired,
    hasProjectApiToken,
    lastProjectUpdatedAt,
    newProjectPath,
    setNewProjectPath,
    newProjectName,
    setNewProjectName,
    newProjectRepoUrl,
    setNewProjectRepoUrl,
    newProjectLaneCount,
    setNewProjectLaneCount,
    refreshProjects,
    applySelectedProject,
    updateSelectedProjectLaneCount,
    registerProject,
    isProjectRegistering,
    handleSocketEvent: handleProjectSocketEvent,
  } = useProjectRegistryOps({
    wsUrl: WS_URL,
  });

  const {
    isWorkConsoleOpen,
    workConsoleDockSide,
    selectedWorkSessionId,
    setSelectedWorkSessionId,
    toggleWorkConsole,
    closeWorkConsole,
    moveWorkConsoleLeft,
    moveWorkConsoleRight,
  } = useWorkConsoleShell();

  const {
    sessions: workSessions,
    selectedSession: selectedWorkSession,
    selectedSessionMessages,
    sessionError: workSessionError,
    isSessionListLoading,
    isSessionDetailLoading,
    isSubmittingMessage,
    createSession,
    submitMessage,
    closeSession,
    handleSocketEvent: handleWorkSessionsSocketEvent,
  } = useWorkSessions({
    wsUrl: WS_URL,
    selectedSessionId: selectedWorkSessionId,
    onSelectedSessionChange: setSelectedWorkSessionId,
  });

  const [isWorkRequestPanelOpen, setIsWorkRequestPanelOpen] = useState(false);
  const [selectedWorkRequestId, setSelectedWorkRequestId] = useState(null);

  const {
    isWorkflowEnabled,
    requests: workRequests,
    selectedRequest: selectedWorkRequest,
    requestError: workRequestError,
    isRequestListLoading,
    isSubmittingRequest,
    createRequest,
    decideRequest,
    handleSocketEvent: handleWorkRequestsSocketEvent,
  } = useWorkRequests({
    wsUrl: WS_URL,
    selectedRequestId: selectedWorkRequestId,
    onSelectedRequestChange: setSelectedWorkRequestId,
  });

  const {
    agents,
    agentError,
    isAgentLoading,
    isAgentAuthRequired,
    handleSocketEvent: handleAgentRegistrySocketEvent,
  } = useAgentRegistry({
    wsUrl: WS_URL,
    enabled: isWorkConsoleOpen,
  });

  const {
    autoApproveStatus,
    autoApproveEvents,
    autoApproveError,
    isAutoApproveLoading,
    isAutoApprovePanelOpen,
    setIsAutoApprovePanelOpen,
    autoApproveDecisionFilter,
    setAutoApproveDecisionFilter,
    autoApproveTokenInput,
    setAutoApproveTokenInput,
    saveAutoApproveToken,
    clearAutoApproveToken,
    isAutoApproveAuthRequired,
    hasAutoApproveApiToken,
    lastAutoApproveUpdatedAt,
    refreshAutoApproveData,
    handleSocketEvent: handleAutoApproveSocketEvent,
  } = useAutoApproveOps({
    wsUrl: WS_URL,
  });

  const handleRealtimeEvent = useCallback((payload) => {
    handleProjectSocketEvent(payload);
    handleHistorySocketEvent(payload);
    handleAutoApproveSocketEvent(payload);
    handleWorkSessionsSocketEvent(payload);
    handleWorkRequestsSocketEvent(payload);
    handleAgentRegistrySocketEvent(payload);
  }, [handleAgentRegistrySocketEvent, handleAutoApproveSocketEvent, handleHistorySocketEvent, handleProjectSocketEvent, handleWorkRequestsSocketEvent, handleWorkSessionsSocketEvent]);

  const activeLaneCount = currentProject?.laneCount || DEFAULT_LANE_COUNT;
  const activeLanes = useMemo(() => getLaneDefinitions(activeLaneCount), [activeLaneCount]);
  const historyProjects = useMemo(() => {
    const mergedProjects = [...projectItems, ...PROJECTS];
    const projectMap = new Map();

    mergedProjects.forEach((project) => {
      if (!project?.id) return;
      if (projectMap.has(project.id)) return;
      projectMap.set(project.id, {
        id: project.id,
        name: project.name || project.id,
      });
    });

    return Array.from(projectMap.values());
  }, [projectItems]);

  const {
    wsStatus,
    connectWebSocket,
    disconnectWebSocket,
    sendSocketAction,
  } = useMaestroRealtime({
    wsUrl: WS_URL,
    activeProjectRef,
    notesRef,
    setNotes,
    setScore,
    setMergedCount,
    setCombo,
    setMaxCombo,
    showFeedback,
    onSocketEvent: handleRealtimeEvent,
    laneCount: activeLaneCount,
  });

  useMaestroGameLoop({
    isPlaying,
    wsStatus,
    setNotes,
    laneCount: activeLaneCount,
  });

  const triggerLaneAction = useCallback((laneId, options = {}) => {
    const { isRejectAction = false, promptFeedback = false, rejectFeedback: directRejectFeedback = '' } = options;
    if (!isPlaying || previewNote) return;

    const laneMatch = activeLanes.find((lane) => lane.id === laneId);
    if (!laneMatch) return;

    const currentProjectId = activeProjectRef.current;
    const selectedFreq = LANE_HIT_FREQS[laneMatch.id] || LANE_HIT_FREQS[LANE_HIT_FREQS.length - 1];
    playBeep(selectedFreq, 'triangle');
    showSfxBurst(laneMatch.id, selectedFreq);

    const currentNotes = notesRef.current;
    const laneNotes = currentNotes.filter(
      (note) => note.lane === laneMatch.id
        && note.projectId === currentProjectId
        && note.status === NOTE_STATUS.READY,
    );
    const hasPendingLaneNote = currentNotes.some(
      (note) => note.lane === laneMatch.id
        && note.projectId === currentProjectId
        && note.status !== NOTE_STATUS.READY,
    );

    if (laneNotes.length === 0) {
      if (hasPendingLaneNote) {
        showFeedback(currentProjectId, laneMatch.id, 'PENDING', 'text-yellow-400');
      } else {
        showFeedback(currentProjectId, laneMatch.id, 'EMPTY', 'text-gray-500');
        setCombo(0);
      }
      return;
    }

    const targetNote = laneNotes[0];

    if (isRejectAction && promptFeedback) {
      // 터치/키보드 공용: window.prompt 대신 반려 시트를 연다 (트랙 F4)
      setRejectSheet({ laneId: laneMatch.id, laneName: laneMatch.name, noteTitle: targetNote.title });
      return;
    }

    const rejectFeedback = (directRejectFeedback || '').trim().slice(0, 300);

    // 타이밍 판정 (점수전용) — 실제 승인/반려 전송에는 영향 없음
    const judgment = isRejectAction ? null : gradeHit({
      noteBottom: targetNote.currentBottom,
      lineBottom: BASE_BOTTOM,
      arrivedAt: targetNote.arrivedAt ?? null,
      now: Date.now(),
    });
    if (judgment) {
      playGradeBeep(selectedFreq, judgment.grade);
      vibrate(HAPTIC_PATTERNS[judgment.grade]);
      showFeedback(currentProjectId, laneMatch.id, judgment.grade, JUDGMENT_GRADE_COLORS[judgment.grade]);
      showLineFlash(currentProjectId, laneMatch.id, JUDGMENT_GRADE_FLASH_COLORS[judgment.grade]);
    } else {
      vibrate(HAPTIC_PATTERNS.REJECT);
    }

    const sent = sendSocketAction({
      action: isRejectAction ? 'REJECT' : 'APPROVE',
      requestId: targetNote.requestId,
      branchName: targetNote.branchName,
      laneIndex: laneMatch.id + 1,
      feedback: isRejectAction ? (rejectFeedback || 'Rejected from dashboard') : '',
    });

    if (sent) {
      setNotes((prev) => prev.map((note) => (
        note.id === targetNote.id
          ? {
            ...note,
            status: isRejectAction ? NOTE_STATUS.REJECTING : NOTE_STATUS.APPROVING,
            // 머지 성공 시점에 등급 보상을 적용하기 위해 노트에 판정을 실어 보낸다
            gradeScore: judgment?.score,
            gradeComboDelta: judgment?.comboDelta,
          }
          : note
      )));
      if (isRejectAction) {
        showFeedback(currentProjectId, laneMatch.id, 'REJECTING...', 'text-orange-300');
      }
      return;
    }

    setNotes((prev) => prev.filter((note) => note.id !== targetNote.id));
    if (isRejectAction) {
      setCombo(0);
      showFeedback(
        currentProjectId,
        laneMatch.id,
        rejectFeedback ? 'REJECTED (WITH FEEDBACK)' : 'REJECTED',
        'text-orange-300',
      );
      return;
    }

    setScore((prevScore) => prevScore + judgment.score);
    setMergedCount((prevCount) => prevCount + 1);
    if (judgment.comboDelta === 0) {
      setCombo(0);
    } else {
      setCombo((prevCombo) => {
        const nextCombo = prevCombo + judgment.comboDelta;
        setMaxCombo((currentMax) => Math.max(currentMax, nextCombo));
        return nextCombo;
      });
    }
  }, [activeLanes, isPlaying, previewNote, sendSocketAction, showFeedback, showLineFlash, showSfxBurst]);

  const confirmRejectSheet = useCallback((reason) => {
    if (!rejectSheet) return;
    setRejectSheet(null);
    triggerLaneAction(rejectSheet.laneId, { isRejectAction: true, rejectFeedback: reason });
  }, [rejectSheet, triggerLaneAction]);

  const cancelRejectSheet = useCallback(() => {
    if (!rejectSheet) return;
    setRejectSheet(null);
    showFeedback(activeProjectRef.current, rejectSheet.laneId, 'REJECT CANCELED', 'text-gray-400');
  }, [rejectSheet, showFeedback]);

  const triggerUndoAction = useCallback(() => {
    if (!isPlaying || previewNote) return;

    const currentProjectId = activeProjectRef.current;
    const sent = sendSocketAction({ action: 'UNDO' });
    if (sent) {
      showFeedback(currentProjectId, -1, 'ROLLBACK REQUESTED', 'text-yellow-400');
      return;
    }

    showFeedback(currentProjectId, -1, '⏪ ROLLBACK EXECUTED', 'text-yellow-400');
    setScore((prevScore) => Math.max(0, prevScore - 100));
    setCombo(0);
  }, [isPlaying, previewNote, sendSocketAction, showFeedback]);

  useMaestroKeyboardControls({
    isPlaying,
    previewNote,
    setPreviewNote,
    setIsBachPanelOpen,
    setIsProjectPanelOpen,
    setIsAutoApprovePanelOpen,
    setIsHistoryPanelOpen,
    setActiveProjectId,
    triggerUndoAction,
    triggerLaneAction,
    lanes: activeLanes,
  });

  const startGame = () => {
    ensureSfxAudioContext();
    setNotes([]);
    setSfxBursts([]);
    setScore(0);
    setCombo(0);
    setIsPlaying(true);
    connectWebSocket();
  };

  const stopGame = () => {
    setIsPlaying(false);
    setNotes([]);
    setSfxBursts([]);
    disconnectWebSocket();
  };

  const handleHistoryPanelToggle = useCallback(() => {
    setIsHistoryPanelOpen((open) => !open);
  }, [setIsHistoryPanelOpen]);

  const handleHistoryPanelClose = useCallback(() => {
    setIsHistoryPanelOpen(false);
  }, [setIsHistoryPanelOpen]);

  const handleAutoApprovePanelToggle = useCallback(() => {
    setIsAutoApprovePanelOpen((open) => !open);
  }, [setIsAutoApprovePanelOpen]);

  const handleAutoApprovePanelClose = useCallback(() => {
    setIsAutoApprovePanelOpen(false);
  }, [setIsAutoApprovePanelOpen]);

  const handleProjectPanelToggle = useCallback(() => {
    setIsProjectPanelOpen((open) => !open);
  }, [setIsProjectPanelOpen]);

  const handleProjectPanelClose = useCallback(() => {
    setIsProjectPanelOpen(false);
  }, [setIsProjectPanelOpen]);

  const handleWorkConsoleToggle = useCallback(() => {
    // Work Console and Work Requests share the right dock; opening one closes the other.
    if (!isWorkConsoleOpen) {
      setIsWorkRequestPanelOpen(false);
    }
    toggleWorkConsole();
  }, [isWorkConsoleOpen, toggleWorkConsole]);

  const handleWorkConsoleClose = useCallback(() => {
    closeWorkConsole();
  }, [closeWorkConsole]);

  const handleWorkRequestPanelToggle = useCallback(() => {
    setIsWorkRequestPanelOpen((open) => {
      const next = !open;
      // Opening Work Requests closes the overlapping Work Console panel.
      if (next && isWorkConsoleOpen) {
        closeWorkConsole();
      }
      return next;
    });
  }, [closeWorkConsole, isWorkConsoleOpen, setIsWorkRequestPanelOpen]);

  const handleWorkRequestPanelClose = useCallback(() => {
    setIsWorkRequestPanelOpen(false);
  }, [setIsWorkRequestPanelOpen]);

  const autoApproveStatusLabel = isAutoApproveAuthRequired
    ? 'Locked'
    : autoApproveStatus.config.enabled
      ? (autoApproveStatus.config.dryRun ? 'Dry Run' : 'Enabled')
      : 'Disabled';

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans overflow-hidden selection:bg-purple-500/30">
      <div
        ref={bachPlayerHostRef}
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
      />

      <MaestroHeader
        headerRef={headerRef}
        isBachPlaying={isBachPlaying}
        isBachReady={isBachReady}
        isBachPlaybackRequested={isBachPlaybackRequested}
        bachVizHz={bachVizHz}
        bachHzLabel={bachHzLabel}
        bachStatusLabel={bachStatusLabel}
        bachPlayerStateCode={bachPlayerStateCode}
        toggleBachPlayback={toggleBachPlayback}
        bachVolume={bachVolume}
        onBachVolumeChange={handleBachVolumeChange}
        isBachPanelOpen={isBachPanelOpen}
        onToggleBachPanel={handleBachPanelToggle}
        bachChannelInput={bachChannelInput}
        onBachChannelInputChange={setBachChannelInput}
        onResetBachChannel={resetBachChannel}
        onCloseBachPanel={handleBachPanelClose}
        onSaveBachChannel={saveBachChannel}
        youtubeUrlHelpText={youtubeUrlHelpText}
        bachError={bachError}
        wsStatus={wsStatus}
        isPlaying={isPlaying}
        score={score}
        mergedCount={mergedCount}
        maxCombo={maxCombo}
        onStartGame={startGame}
        onStopGame={stopGame}
        onUndo={triggerUndoAction}
        currentRuntimeProjectName={currentProject.name}
        isProjectPanelOpen={isProjectPanelOpen}
        onToggleProjectPanel={handleProjectPanelToggle}
        isProjectAuthRequired={isProjectAuthRequired}
        autoApproveStatusLabel={autoApproveStatusLabel}
        autoApproveEventCount={autoApproveStatus.runtime.autoApproveEventCount}
        isAutoApproveEnabled={autoApproveStatus.config.enabled}
        isAutoApproveDryRun={autoApproveStatus.config.dryRun}
        isAutoApproveAuthRequired={isAutoApproveAuthRequired}
        isAutoApprovePanelOpen={isAutoApprovePanelOpen}
        onToggleAutoApprovePanel={handleAutoApprovePanelToggle}
        historyCount={historyBadgeCount}
        isHistoryPanelOpen={isHistoryPanelOpen}
        onToggleHistoryPanel={handleHistoryPanelToggle}
        isWorkConsoleOpen={isWorkConsoleOpen}
        onToggleWorkConsole={handleWorkConsoleToggle}
        isWorkflowEnabled={isWorkflowEnabled === true}
        isWorkRequestPanelOpen={isWorkRequestPanelOpen}
        onToggleWorkRequestPanel={handleWorkRequestPanelToggle}
      />

      <ProjectTabs
        projects={PROJECTS}
        notes={notes}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
      />

      <LaneBoard
        lanes={activeLanes}
        notes={notes}
        activeProjectId={activeProjectId}
        combo={combo}
        feedbacks={feedbacks}
        sfxBursts={sfxBursts}
        lineFlashes={lineFlashes}
        baseBottom={BASE_BOTTOM}
        noteStatus={NOTE_STATUS}
        onPreviewNote={setPreviewNote}
        onLaneAction={triggerLaneAction}
      />

      <FooterHelp lanes={activeLanes} />
      <WorkConsolePanel
        isOpen={isWorkConsoleOpen}
        dockSide={workConsoleDockSide}
        sessions={workSessions}
        selectedSessionId={selectedWorkSessionId}
        selectedSession={selectedWorkSession}
        messages={selectedSessionMessages}
        isSessionListLoading={isSessionListLoading}
        isSessionDetailLoading={isSessionDetailLoading}
        isSubmittingMessage={isSubmittingMessage}
        sessionError={workSessionError}
        agents={agents}
        isAgentLoading={isAgentLoading}
        agentError={agentError}
        isAgentAuthRequired={isAgentAuthRequired}
        onSelectSession={setSelectedWorkSessionId}
        onCreateSession={createSession}
        onSubmitMessage={submitMessage}
        onCloseSession={closeSession}
        onClose={handleWorkConsoleClose}
        onMoveLeft={moveWorkConsoleLeft}
        onMoveRight={moveWorkConsoleRight}
      />
      {isWorkflowEnabled === true && (
        <WorkRequestPanel
          isOpen={isWorkRequestPanelOpen}
          requests={workRequests}
          selectedRequestId={selectedWorkRequestId}
          selectedRequest={selectedWorkRequest}
          isLoading={isRequestListLoading}
          isSubmitting={isSubmittingRequest}
          error={workRequestError}
          laneCount={activeLaneCount}
          onSelectRequest={setSelectedWorkRequestId}
          onCreateRequest={createRequest}
          onDecide={decideRequest}
          onClose={handleWorkRequestPanelClose}
        />
      )}
      <ProjectRegistryPanel
        isOpen={isProjectPanelOpen}
        panelTopOffset={panelTopOffset}
        onClose={handleProjectPanelClose}
        projects={projectItems}
        currentProject={currentProject}
        selectedProjectId={selectedProjectId}
        onSelectedProjectChange={setSelectedProjectId}
        selectedProjectLaneCount={selectedProjectLaneCount}
        onSelectedProjectLaneCountChange={setSelectedProjectLaneCount}
        onRefresh={refreshProjects}
        onApply={applySelectedProject}
        isLoading={isProjectLoading}
        isApplying={isProjectApplying}
        isUpdating={isProjectUpdating}
        onUpdateLaneCount={updateSelectedProjectLaneCount}
        error={projectError}
        isAuthRequired={isProjectAuthRequired}
        tokenInput={projectTokenInput}
        onTokenInputChange={setProjectTokenInput}
        onSaveToken={saveProjectToken}
        onClearToken={clearProjectToken}
        hasToken={hasProjectApiToken}
        lastUpdatedAt={lastProjectUpdatedAt}
        newProjectPath={newProjectPath}
        onNewProjectPathChange={setNewProjectPath}
        newProjectName={newProjectName}
        onNewProjectNameChange={setNewProjectName}
        newProjectRepoUrl={newProjectRepoUrl}
        onNewProjectRepoUrlChange={setNewProjectRepoUrl}
        newProjectLaneCount={newProjectLaneCount}
        onNewProjectLaneCountChange={setNewProjectLaneCount}
        onRegisterProject={registerProject}
        isRegistering={isProjectRegistering}
      />
      <AutoApproveOpsPanel
        isOpen={isAutoApprovePanelOpen}
        panelTopOffset={panelTopOffset}
        onClose={handleAutoApprovePanelClose}
        statusData={autoApproveStatus}
        events={autoApproveEvents}
        isLoading={isAutoApproveLoading}
        error={autoApproveError}
        isAuthRequired={isAutoApproveAuthRequired}
        decisionFilter={autoApproveDecisionFilter}
        onDecisionFilterChange={setAutoApproveDecisionFilter}
        onRefresh={refreshAutoApproveData}
        tokenInput={autoApproveTokenInput}
        onTokenInputChange={setAutoApproveTokenInput}
        onSaveToken={saveAutoApproveToken}
        onClearToken={clearAutoApproveToken}
        hasToken={hasAutoApproveApiToken}
        lastUpdatedAt={lastAutoApproveUpdatedAt}
      />
      <HistoryScorePanel
        isOpen={isHistoryPanelOpen}
        panelTopOffset={panelTopOffset}
        onClose={handleHistoryPanelClose}
        items={visibleHistoryItems}
        isLoading={isHistoryLoading}
        historyError={historyError}
        filteredHistoryCount={filteredHistoryCount}
        hasMore={hasMoreHistoryItems}
        onLoadMore={loadMoreHistory}
        projects={historyProjects}
        lanes={activeLanes}
        projectFilter={historyProjectFilter}
        onProjectFilterChange={setHistoryProjectFilter}
        resultFilter={historyResultFilter}
        onResultFilterChange={setHistoryResultFilter}
        sourceFilter={historySourceFilter}
        onSourceFilterChange={setHistorySourceFilter}
      />

      <PreviewModal previewNote={previewNote} onClose={() => setPreviewNote(null)} />
      {rejectSheet && (
        <RejectSheet
          laneName={rejectSheet.laneName}
          noteTitle={rejectSheet.noteTitle}
          onConfirm={confirmRejectSheet}
          onCancel={cancelRejectSheet}
        />
      )}
    </div>
  );
}
