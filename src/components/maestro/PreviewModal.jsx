import React from 'react';
import { AlertTriangle, Check, GitCommit, X } from 'lucide-react';

const FILE_STATUS_LABELS = {
  added: '추가',
  deleted: '삭제',
  renamed: '이름변경',
  modified: '수정',
};

function DiffLines({ text }) {
  return (
    <div className="bg-gray-950 font-mono text-xs overflow-x-auto whitespace-pre">
      {String(text || '').split('\n').map((line, i) => {
        let colorClass = 'text-gray-300';
        let bgClass = '';
        if (line.startsWith('+')) { colorClass = 'text-green-400'; bgClass = 'bg-green-900/20 w-full inline-block'; }
        if (line.startsWith('-')) { colorClass = 'text-red-400'; bgClass = 'bg-red-900/20 w-full inline-block'; }
        if (line.startsWith('@@')) { colorClass = 'text-blue-400'; }

        return (
          <span key={i} className={`${colorClass} ${bgClass} block px-2`}>
            {line}
          </span>
        );
      })}
    </div>
  );
}

function MergeBadge({ review }) {
  if (review.mergeable === true) {
    return (
      <span data-testid="review-merge-badge" className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">
        <Check className="h-3 w-3" /> 머지 가능
      </span>
    );
  }
  if (review.mergeable === false) {
    return (
      <span data-testid="review-merge-badge" className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
        <AlertTriangle className="h-3 w-3" /> 충돌 {review.conflictFiles?.length || 0}개
      </span>
    );
  }
  return (
    <span data-testid="review-merge-badge" className="inline-flex items-center gap-1 rounded-full border border-gray-600 bg-gray-800/80 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
      판정 불가
    </span>
  );
}

function ReviewBody({ review }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 bg-gray-900/70 px-4 py-2 text-[11px] text-gray-300">
        <MergeBadge review={review} />
        <span className="font-mono text-cyan-200">{review.branchName}</span>
        <span className="text-gray-500">→ {review.baseRef}</span>
        <span className="ml-auto flex items-center gap-3 font-mono">
          <span>파일 {review.stats?.filesChanged ?? review.files.length}</span>
          <span className="text-green-400">+{review.stats?.additions ?? 0}</span>
          <span className="text-red-400">−{review.stats?.deletions ?? 0}</span>
          <span>커밋 {review.commits.length}</span>
        </span>
      </div>

      {review.mergeable === false && review.conflictFiles?.length > 0 && (
        <div className="border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[11px] text-red-200">
          충돌 파일: <span className="font-mono">{review.conflictFiles.join(', ')}</span> — 승인 시 머지가 실패할 수 있습니다.
        </div>
      )}

      <div className="max-h-[55vh] overflow-y-auto">
        {review.commits.length > 0 && (
          <ul className="border-b border-gray-800 px-4 py-2">
            {review.commits.map((commit) => (
              <li key={commit.sha} className="flex items-baseline gap-2 py-0.5 text-xs">
                <span className="shrink-0 font-mono text-gray-500">{commit.sha}</span>
                <span className="min-w-0 truncate text-gray-200">{commit.subject}</span>
                <span className="ml-auto shrink-0 text-[10px] text-gray-500">{commit.author}</span>
              </li>
            ))}
          </ul>
        )}

        {review.files.map((file) => (
          <section key={file.path} className="border-b border-gray-800/70">
            <div className="flex items-center gap-2 bg-gray-900/60 px-4 py-1.5 text-xs">
              <span className="min-w-0 truncate font-mono text-gray-100">{file.path}</span>
              <span className="shrink-0 rounded border border-gray-700 px-1 text-[10px] text-gray-400">{FILE_STATUS_LABELS[file.status] || file.status}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px]">
                <span className="text-green-400">+{file.additions}</span>{' '}
                <span className="text-red-400">−{file.deletions}</span>
              </span>
            </div>
            {file.binary ? (
              <p className="px-4 py-2 text-[11px] text-gray-500">바이너리 파일 — 패치 표시 없음</p>
            ) : (
              <DiffLines text={file.patch} />
            )}
            {file.truncated && (
              <p className="px-4 py-1 text-[10px] text-amber-300">…패치가 커서 일부만 표시했습니다.</p>
            )}
          </section>
        ))}
        {review.stats?.truncated && (
          <p className="px-4 py-2 text-[11px] text-amber-300">변경이 많아 일부 파일/패치가 생략되었습니다. 전체는 저장소에서 확인하세요.</p>
        )}
      </div>
    </>
  );
}

export default function PreviewModal({
  previewNote,
  onClose,
  review = null,
  isReviewLoading = false,
  reviewError = null,
  onApprove,
  onReject,
}) {
  if (!previewNote) return null;

  const hasServerReview = Boolean(review) && review.requestId === previewNote.requestId;

  return (
    <div
      data-testid="preview-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={previewNote.title}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50">
          <div className="flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-gray-100">{previewNote.title}</h3>
          </div>
          <button onClick={onClose} aria-label="미리보기 닫기" className="maestro-touch-control flex items-center justify-center rounded-md text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {hasServerReview ? (
          <ReviewBody review={review} />
        ) : (
          <div data-testid="review-fallback">
            {isReviewLoading ? (
              <p className="px-4 pt-3 text-[11px] text-gray-400">서버에서 리뷰 데이터를 불러오는 중...</p>
            ) : (
              <p className="px-4 pt-3 text-[11px] text-amber-300">
                서버 리뷰 데이터를 불러올 수 없어 에이전트 요약만 표시합니다.
                {reviewError ? ` (${reviewError})` : ''}
              </p>
            )}
            <div className="p-4 bg-gray-950 font-mono text-sm overflow-x-auto whitespace-pre">
              <DiffLines text={previewNote.diff} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-3 border-t border-gray-800 bg-gray-900">
          <span className="text-xs text-gray-500"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded">Esc</kbd> 로 닫기</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="maestro-touch-control px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors">
              확인
            </button>
            {typeof onReject === 'function' && (
              <button
                onClick={onReject}
                aria-label="리뷰 반려"
                className="maestro-touch-control rounded bg-orange-600/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-500"
              >
                반려
              </button>
            )}
            {typeof onApprove === 'function' && (
              <button
                onClick={onApprove}
                aria-label="리뷰 승인"
                className="maestro-touch-control rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500"
              >
                승인
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
