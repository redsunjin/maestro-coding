import { useState } from 'react';

// 엄격 모드 토큰 게이트: 운영자 서버 토큰을 받아 저장·재연결을 트리거한다 (스펙 2026-08-03 §1).
export default function TokenGate({ onSubmit }) {
  const [token, setToken] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <form
        className="w-full max-w-sm rounded-2xl bg-slate-900 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim()) onSubmit(token.trim());
        }}
      >
        <h2 className="text-lg font-semibold">서버 토큰 필요</h2>
        <p className="mt-1 text-sm text-slate-400">
          엄격 모드 서버입니다. MAESTRO_WORKFLOW_SERVER_TOKEN 값을 입력하세요.
        </p>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="서버 토큰"
          aria-label="서버 토큰"
          className="mt-4 w-full rounded-lg bg-slate-800 px-3 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={!token.trim()}
          className="mt-4 min-h-[44px] w-full rounded-xl bg-indigo-600 font-semibold transition active:scale-95 disabled:opacity-40"
        >
          연결
        </button>
      </form>
    </div>
  );
}
