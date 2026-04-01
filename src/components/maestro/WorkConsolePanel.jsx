import React, { useEffect, useRef } from 'react';
import { ArrowLeftToLine, ArrowRightToLine, Command, MessagesSquare, TerminalSquare, X } from 'lucide-react';

const PANEL_ID = 'work-console-panel';
const PANEL_TITLE_ID = 'work-console-panel-title';
const PANEL_SUMMARY_ID = 'work-console-panel-summary';

export default function WorkConsolePanel({
  isOpen,
  dockSide,
  selectedSessionId,
  onSelectSession,
  onClose,
  onMoveLeft,
  onMoveRight,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <aside
      id={PANEL_ID}
      data-testid="work-console-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      aria-hidden={!isOpen}
      tabIndex={-1}
      className={`fixed bottom-16 left-3 right-3 top-24 z-[45] transition-all duration-200 sm:bottom-4 sm:top-20 sm:w-[440px] ${
        dockSide === 'left'
          ? 'sm:left-4 sm:right-auto'
          : 'sm:left-auto sm:right-4'
      } ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0'
          : dockSide === 'left'
            ? 'pointer-events-none opacity-0 translate-y-2 sm:-translate-x-4'
            : 'pointer-events-none opacity-0 translate-y-2 sm:translate-x-4'
      }`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-cyan-500/20 bg-slate-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="border-b border-gray-800/80 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/70">VU-001</div>
              <div id={PANEL_TITLE_ID} className="mt-1 text-sm font-semibold text-white">Work Console</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">
                  shell
                </span>
                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">
                  dock {dockSide}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onMoveLeft}
                aria-label="Work Console 왼쪽으로 이동"
                className={`rounded-md border p-1.5 text-gray-300 transition-colors hover:text-white ${
                  dockSide === 'left'
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                    : 'border-gray-700 hover:border-cyan-400/40'
                }`}
              >
                <ArrowLeftToLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onMoveRight}
                aria-label="Work Console 오른쪽으로 이동"
                className={`rounded-md border p-1.5 text-gray-300 transition-colors hover:text-white ${
                  dockSide === 'right'
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                    : 'border-gray-700 hover:border-cyan-400/40'
                }`}
              >
                <ArrowRightToLine className="h-3.5 w-3.5" />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Work Console 닫기"
                className="rounded-md border border-gray-700 p-1.5 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p id={PANEL_SUMMARY_ID} className="mt-3 max-w-[34ch] text-[11px] leading-5 text-gray-400">
            작업 대화, 명령 결과, 계획 카드가 들어올 자리입니다. 지금은 패널 구조와 도킹 동작만 검증합니다.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[168px_minmax(0,1fr)]">
          <section className="min-h-[160px] rounded-2xl border border-gray-800 bg-gray-950/90 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
              <MessagesSquare className="h-4 w-4 text-cyan-300" />
              Sessions
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-3">
              <div className="text-[11px] text-gray-200">아직 열린 작업 세션이 없습니다.</div>
              <p className="mt-2 text-[10px] leading-4 text-gray-500">
                `/work` 요청이 연결되면 최근 활성 세션, pending decision, blocked 상태가 여기 쌓입니다.
              </p>
              <button
                type="button"
                onClick={() => onSelectSession(selectedSessionId ? null : 'mock-session')}
                className="mt-3 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/15"
              >
                목업 세션 보기
              </button>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-950 via-slate-950 to-gray-950">
            <div className="border-b border-gray-800 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Current Session</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {selectedSessionId ? 'history export coordination' : '세션을 선택하면 대화와 작업 카드가 여기에 표시됩니다.'}
                  </div>
                </div>
                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300">
                  {selectedSessionId ? 'waiting' : 'idle'}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
              <div className="rounded-2xl border border-dashed border-gray-700/80 bg-gray-950/60 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                  <TerminalSquare className="h-4 w-4 text-cyan-300" />
                  Timeline Placeholder
                </div>
                <p className="mt-2 text-[11px] leading-5 text-gray-400">
                  message, command, command result, plan card, delivery card가 한 타임라인에 섞여 들어올 구조입니다.
                </p>
              </div>

              {selectedSessionId && (
                <>
                  <article className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Operator</div>
                    <p className="mt-2 text-sm text-gray-100">/work 승인 이력 export 설계해줘</p>
                  </article>

                  <article className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">Plan Card Placeholder</div>
                    <p className="mt-2 text-sm text-gray-100">계획 요약, 리스크, 검증 전략, 결정 버튼이 들어갈 자리입니다.</p>
                  </article>
                </>
              )}
            </div>

            <div className="border-t border-gray-800 px-4 py-3">
              <label htmlFor="work-console-input" className="flex items-center gap-2 text-[11px] font-semibold text-gray-300">
                <Command className="h-3.5 w-3.5 text-cyan-300" />
                Command Input Shell
              </label>
              <textarea
                id="work-console-input"
                aria-label="Work Console 명령 입력"
                rows={3}
                disabled
                placeholder="/work 승인 이력 export 설계해줘"
                className="mt-2 w-full resize-none rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-500"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-gray-500">실제 전송은 다음 단계에서 연결됩니다.</p>
                <button
                  type="button"
                  disabled
                  className="rounded-md border border-gray-700 px-3 py-1.5 text-[11px] font-semibold text-gray-500"
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
