import React, { useEffect, useMemo, useRef } from 'react';
import { Check, KeyRound, RefreshCw, X } from 'lucide-react';

const PANEL_ID = 'project-registry-panel';
const PANEL_TITLE_ID = 'project-registry-title';
const PANEL_SUMMARY_ID = 'project-registry-summary';

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function ProjectRegistryPanel({
  isOpen,
  onClose,
  projects,
  currentProject,
  selectedProjectId,
  onSelectedProjectChange,
  onRefresh,
  onApply,
  isLoading,
  isApplying,
  error,
  isAuthRequired,
  tokenInput,
  onTokenInputChange,
  onSaveToken,
  onClearToken,
  hasToken,
  lastUpdatedAt,
  newProjectPath,
  onNewProjectPathChange,
  newProjectName,
  onNewProjectNameChange,
  newProjectRepoUrl,
  onNewProjectRepoUrlChange,
  onRegisterProject,
  isRegistering,
}) {
  const closeButtonRef = useRef(null);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || currentProject;
  const isCurrentSelection = selectedProject?.path && selectedProject.path === currentProject.path;
  const srSummary = useMemo(() => {
    if (isAuthRequired) {
      return '프로젝트 전환 API 인증이 필요합니다. 서버 토큰을 입력해야 목록을 조회하고 프로젝트를 바꿀 수 있습니다.';
    }
    return `현재 활성 프로젝트는 ${currentProject.name || 'unknown'} 입니다. 등록된 프로젝트 ${projects.length}개 중 ${
      selectedProject?.name || 'unknown'
    } 가 선택되어 있습니다.`;
  }, [currentProject.name, isAuthRequired, projects.length, selectedProject?.name]);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <aside
      id={PANEL_ID}
      data-testid="project-registry-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      aria-hidden={!isOpen}
      tabIndex={-1}
      className={`fixed z-40 transition-all duration-200 ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0 sm:translate-x-0'
          : 'pointer-events-none opacity-0 translate-y-2 sm:-translate-x-4'
      } left-3 right-3 top-20 sm:left-4 sm:right-auto sm:w-[420px]`}
    >
      <div className="rounded-2xl border border-gray-700/80 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-gray-700/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <span id={PANEL_TITLE_ID} className="text-sm font-semibold text-white">Workspace Repo</span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-100">
              {projects.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="프로젝트 목록 새로고침"
              className="rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="프로젝트 전환 패널 닫기"
              className="rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p id={PANEL_SUMMARY_ID} className="sr-only">
          {srSummary}
        </p>

        <div aria-live="polite" className="sr-only">
          {srSummary}
        </div>

        <div className="space-y-3 px-3 py-3">
          <section className="rounded-xl border border-gray-700/70 bg-gray-950/80 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Current Repo</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                Active
              </span>
              <span className="text-sm font-semibold text-white">{currentProject.name || 'unknown project'}</span>
            </div>
            <div className="mt-2 break-all text-[11px] text-gray-300">{currentProject.path || '-'}</div>
            {currentProject.repoUrl && (
              <div className="mt-1 break-all text-[11px] text-cyan-200">{currentProject.repoUrl}</div>
            )}
            {lastUpdatedAt && (
              <div className="mt-2 text-[10px] text-gray-500">
                updated {formatTimestamp(lastUpdatedAt)}
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {error}
            </div>
          )}

          <section className="rounded-xl border border-gray-700/70 bg-gray-950/70 px-3 py-3">
            <label htmlFor="project-registry-select" className="text-[11px] font-semibold text-gray-300">
              연결할 프로젝트
            </label>
            <select
              id="project-registry-select"
              aria-label="연결할 프로젝트"
              value={selectedProjectId}
              onChange={(event) => onSelectedProjectChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 outline-none focus:border-cyan-300"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            {selectedProject && (
              <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/80 px-3 py-3 text-[11px] text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{selectedProject.name}</span>
                  {selectedProject.isActive && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100">
                      current
                    </span>
                  )}
                </div>
                <div className="mt-2 break-all">{selectedProject.path || '-'}</div>
                {selectedProject.repoUrl && (
                  <div className="mt-1 break-all text-cyan-200">{selectedProject.repoUrl}</div>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[10px] text-gray-500">
                선택 후 적용하면 다음 승인/롤백부터 바로 사용됩니다.
              </div>
              <button
                type="button"
                onClick={onApply}
                disabled={!selectedProjectId || isCurrentSelection || isApplying}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {isApplying ? '적용 중...' : isCurrentSelection ? '적용됨' : '적용'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-3">
            <div className="text-[11px] font-semibold text-cyan-100">새 프로젝트 바로 등록</div>
            <p className="mt-1 text-[10px] text-cyan-100/70">
              Git 레포 폴더를 입력하면 registry에 저장하고 바로 활성 프로젝트로 전환합니다.
            </p>

            <label htmlFor="new-project-path" className="mt-3 block text-[11px] text-gray-300">
              프로젝트 폴더 경로
            </label>
            <input
              id="new-project-path"
              aria-label="새 프로젝트 폴더 경로"
              type="text"
              value={newProjectPath}
              onChange={(event) => onNewProjectPathChange(event.target.value)}
              placeholder="/Users/you/projects/my-app"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 outline-none focus:border-cyan-300"
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-project-name" className="block text-[11px] text-gray-300">
                  프로젝트 별칭
                </label>
                <input
                  id="new-project-name"
                  aria-label="새 프로젝트 별칭"
                  type="text"
                  value={newProjectName}
                  onChange={(event) => onNewProjectNameChange(event.target.value)}
                  placeholder="my-app"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 outline-none focus:border-cyan-300"
                />
              </div>
              <div>
                <label htmlFor="new-project-link" className="block text-[11px] text-gray-300">
                  프로젝트 링크
                </label>
                <input
                  id="new-project-link"
                  aria-label="새 프로젝트 링크"
                  type="text"
                  value={newProjectRepoUrl}
                  onChange={(event) => onNewProjectRepoUrlChange(event.target.value)}
                  placeholder="https://github.com/org/my-app"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 outline-none focus:border-cyan-300"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[10px] text-gray-500">
                링크를 비워두면 가능하면 `origin` URL을 자동으로 추론합니다.
              </div>
              <button
                type="button"
                onClick={onRegisterProject}
                disabled={!newProjectPath.trim() || isRegistering}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {isRegistering ? '등록 중...' : '등록 후 적용'}
              </button>
            </div>
          </section>

          {(isAuthRequired || hasToken) && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                <KeyRound className="h-3.5 w-3.5" />
                Server Token
              </div>
              <p className="mt-1 text-[11px] text-amber-100/80">
                토큰 모드 서버에서는 프로젝트 목록 조회와 전환에도 `Bearer` 토큰이 필요합니다.
              </p>
              <label htmlFor="project-api-token" className="sr-only">프로젝트 API 토큰</label>
              <input
                id="project-api-token"
                aria-label="프로젝트 API 토큰"
                type="password"
                value={tokenInput}
                onChange={(event) => onTokenInputChange(event.target.value)}
                placeholder="maestro server token"
                className="mt-2 w-full rounded-lg border border-amber-500/30 bg-gray-950 px-2 py-2 text-sm text-white outline-none focus:border-amber-300"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                {hasToken && (
                  <button
                    type="button"
                    onClick={onClearToken}
                    className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-500/10"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSaveToken}
                  className="rounded-md bg-amber-400 px-2 py-1 text-[11px] font-semibold text-black hover:bg-amber-300"
                >
                  저장
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
