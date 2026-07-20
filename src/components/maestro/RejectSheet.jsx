import React, { useState } from 'react';
import { X } from 'lucide-react';

const QUICK_REASONS = ['테스트 실패', '설계 불일치', '범위 벗어남', '직접 수정'];
const MAX_REASON_LENGTH = 300;

export default function RejectSheet({ laneName, noteTitle, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');

  const appendQuickReason = (quickReason) => {
    setReason((prev) => {
      const next = prev ? `${prev} ${quickReason}` : quickReason;
      return next.slice(0, MAX_REASON_LENGTH);
    });
  };

  return (
    <div
      data-testid="reject-sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
    >
      <div
        data-testid="reject-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="반려 사유 입력"
        className="w-full max-w-lg rounded-t-2xl border border-orange-500/40 bg-gray-900 p-4 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-orange-200">
              {laneName} 반려
            </h3>
            {noteTitle && (
              <p className="mt-0.5 truncate text-xs text-gray-400">{noteTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="반려 시트 닫기"
            className="maestro-touch-control flex items-center justify-center rounded-md text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_REASONS.map((quickReason) => (
            <button
              key={quickReason}
              type="button"
              onClick={() => appendQuickReason(quickReason)}
              className="maestro-touch-control maestro-touch-control--compact rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-medium text-orange-100 hover:bg-orange-500/20"
            >
              {quickReason}
            </button>
          ))}
        </div>

        <textarea
          aria-label="반려 사유 입력"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
          placeholder="반려 사유를 입력하세요 (선택)"
          rows={3}
          className="mt-3 w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 outline-none focus:border-orange-400"
        />

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="maestro-touch-control rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800"
          >
            반려 취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim().slice(0, MAX_REASON_LENGTH))}
            className="maestro-touch-control rounded-md bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400"
          >
            반려 확정
          </button>
        </div>
      </div>
    </div>
  );
}
