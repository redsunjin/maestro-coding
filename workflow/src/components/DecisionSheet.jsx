import { useState } from 'react';
import { formatPresetHighlight } from '../lib/presets.js';

const REJECT_REASONS = ['정책 위반', '정보 부족', '비용 초과', '기타'];
const SECONDARY_ACTIONS = [
  ['revise', '보완 요청'],
  ['ask', '질문'],
  ['cancel', '취소'],
];

// 결정 시트: 상세 표시 + 승인/반려. 반려는 사유 칩 + 자유 입력 (본체 터치 반려 시트 패턴 계승).
export default function DecisionSheet({ request, onDecide, onClose }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const highlight = formatPresetHighlight(request.subjectType, request.subject.payload);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        data-testid="sheet-backdrop"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-xl rounded-t-2xl bg-slate-900 p-5 pb-8">
        <div className="mb-1 text-[10px] uppercase text-indigo-400">{request.subjectType}</div>
        <h2 className="text-lg font-semibold">{request.subject.title}</h2>
        {request.subject.summary ? (
          <p className="mt-1 text-sm text-slate-400">{request.subject.summary}</p>
        ) : null}
        {highlight ? (
          <div className="mt-3 rounded-lg bg-slate-800 px-3 py-2">
            <div className="text-base font-bold">{highlight.label}</div>
            {highlight.detail ? <div className="text-xs text-slate-400">{highlight.detail}</div> : null}
          </div>
        ) : null}
        <pre
          data-testid="payload-json"
          className="mt-3 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400"
        >
          {JSON.stringify(request.subject.payload, null, 2)}
        </pre>
        <div className="mt-2 text-xs text-slate-500">요청자: {request.actorId}</div>

        {rejecting ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {REJECT_REASONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className={`min-h-[44px] rounded-full px-4 text-sm transition active:scale-95 ${
                    reason === chip ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="반려 사유 직접 입력"
              className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-3 text-sm"
            />
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => onDecide('reject', reason.trim())}
              className="mt-3 min-h-[44px] w-full rounded-xl bg-rose-600 font-semibold transition active:scale-95 disabled:opacity-40"
            >
              반려 확정
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => onDecide('approve', '')}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 font-semibold transition active:scale-95"
              >
                승인
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="min-h-[44px] flex-1 rounded-xl bg-rose-600/80 font-semibold transition active:scale-95"
              >
                반려
              </button>
            </div>
            {/* 보조 액션 (스펙 §4): revise / ask / cancel */}
            <div className="mt-3 flex gap-2">
              {SECONDARY_ACTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDecide(value, '')}
                  className="min-h-[44px] flex-1 rounded-lg bg-slate-800 text-xs text-slate-300 transition active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
