import React, { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { normalizeWsUrlInput, testWsConnection } from '../../utils/server-address.js';

const TEST_RESULT_CLASSES = {
  testing: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  success: 'border-green-500/40 bg-green-500/10 text-green-200',
  failure: 'border-red-500/40 bg-red-500/10 text-red-200',
};

export default function ServerAddressPanel({
  isOpen,
  currentWsUrl,
  hasStoredWsUrl,
  onSave,
  onReset,
  onClose,
}) {
  const [addressInput, setAddressInput] = useState(currentWsUrl);
  const [saveError, setSaveError] = useState('');
  const [testState, setTestState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    setAddressInput(currentWsUrl);
  }, [currentWsUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSaveError('');
      setTestState({ status: 'idle', message: '' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const result = onSave(addressInput);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setSaveError('');
    onClose();
  };

  const handleTest = async () => {
    const normalized = normalizeWsUrlInput(addressInput);
    if (!normalized) {
      setTestState({ status: 'failure', message: '주소 형식이 올바르지 않아 테스트할 수 없습니다.' });
      return;
    }
    setTestState({ status: 'testing', message: `${normalized} 연결 확인 중...` });
    const result = await testWsConnection(normalized);
    setTestState(result.ok
      ? { status: 'success', message: `연결 성공 — ${normalized}` }
      : { status: 'failure', message: `연결 실패 — ${normalized}. 서버(PC)가 켜져 있고 같은 네트워크인지 확인하세요.` });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        id="server-address-panel"
        data-testid="server-address-panel"
        role="dialog"
        aria-modal="true"
        aria-label="서버 주소 설정"
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900/95 p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-cyan-300" />
          <h2 className="text-base font-bold text-gray-100">Maestro 서버 주소</h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
          maestro-server.js가 실행 중인 PC의 주소를 입력하세요. 아이패드에서는 PC의 LAN IP가 필요합니다.
        </p>

        <label htmlFor="server-address-input" className="mt-4 block text-[11px] font-semibold text-gray-300">
          서버 주소
        </label>
        <input
          id="server-address-input"
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="서버 주소 입력"
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          placeholder="ws://192.168.0.10:8080"
          className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm text-gray-100 outline-none focus:border-cyan-400"
        />
        <p className="mt-1 text-[10px] text-gray-500">
          IP만 입력하면 ws://IP:8080으로 저장됩니다. {hasStoredWsUrl ? '현재 저장된 주소를 사용 중입니다.' : '현재 기본 주소를 사용 중입니다.'}
        </p>

        {saveError && (
          <p role="alert" className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">
            {saveError}
          </p>
        )}

        {testState.status !== 'idle' && (
          <p
            data-testid="server-address-test-result"
            className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${TEST_RESULT_CLASSES[testState.status]}`}
          >
            {testState.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testState.status === 'testing'}
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-cyan-500/40 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
            >
              연결 테스트
            </button>
            <button
              type="button"
              onClick={onReset}
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/10"
            >
              기본 주소 복원
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-800"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleSave}
              aria-label="서버 주소 저장"
              className="maestro-touch-control maestro-touch-control--compact rounded-md bg-cyan-500 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-cyan-400"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
