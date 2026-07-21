import React, { useEffect, useRef, useState } from 'react';
import { Server } from 'lucide-react';
import { isNativeShell, normalizeWsUrlInput, testWsConnection } from '../../utils/server-address.js';

const ZEROCONF_WATCH_OPTIONS = { type: '_maestro._tcp.', domain: 'local.' };
const DISCOVERY_WINDOW_MS = 8000;

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
  const [discovery, setDiscovery] = useState({ status: 'idle', results: [], message: '' });
  const discoveryTimerRef = useRef(null);

  useEffect(() => {
    setAddressInput(currentWsUrl);
  }, [currentWsUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSaveError('');
      setTestState({ status: 'idle', message: '' });
      setDiscovery({ status: 'idle', results: [], message: '' });
      clearTimeout(discoveryTimerRef.current);
    }
  }, [isOpen]);

  useEffect(() => () => clearTimeout(discoveryTimerRef.current), []);

  if (!isOpen) return null;

  // Bonjour 발견은 네이티브 셸 + ZeroConf 플러그인이 실제 탑재된 빌드에서만 노출한다.
  // (SPM 빌드는 플러그인 Package.swift 부재로 미탑재일 수 있음 — 그 경우 수동 입력이 폴백)
  const canDiscoverNearbyServers = isNativeShell()
    && window.Capacitor?.isPluginAvailable?.('ZeroConf') === true;

  const handleDiscover = async () => {
    setDiscovery({ status: 'scanning', results: [], message: '주변 Maestro 서버 검색 중...' });
    try {
      const { ZeroConf } = await import('capacitor-zeroconf');
      const found = new Map();

      await ZeroConf.watch(ZEROCONF_WATCH_OPTIONS, (result) => {
        if (result?.action !== 'resolved') return;
        const service = result.service || {};
        const ip = service.ipv4Addresses?.[0];
        if (!ip || !service.port) return;
        found.set(`${ip}:${service.port}`, {
          name: service.name || 'Maestro',
          wsUrl: `ws://${ip}:${service.port}`,
        });
        setDiscovery({ status: 'scanning', results: Array.from(found.values()), message: '검색 중... 항목을 누르면 주소가 채워집니다.' });
      });

      clearTimeout(discoveryTimerRef.current);
      discoveryTimerRef.current = setTimeout(async () => {
        try {
          await ZeroConf.unwatch(ZEROCONF_WATCH_OPTIONS);
        } catch {
          // unwatch 실패는 무시
        }
        setDiscovery((prev) => ({
          status: 'done',
          results: prev.results,
          message: prev.results.length > 0 ? '검색 완료 — 항목을 누르면 주소가 채워집니다.' : '서버를 찾지 못했습니다. PC에서 서버 실행 여부와 같은 Wi-Fi인지 확인하세요.',
        }));
      }, DISCOVERY_WINDOW_MS);
    } catch {
      setDiscovery({ status: 'error', results: [], message: '주변 서버 검색을 사용할 수 없습니다. 주소를 직접 입력하세요.' });
    }
  };

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

        {canDiscoverNearbyServers && (
          <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-gray-300">주변 서버 (Bonjour)</span>
              <button
                type="button"
                onClick={handleDiscover}
                disabled={discovery.status === 'scanning'}
                className="maestro-touch-control maestro-touch-control--compact rounded-md border border-purple-500/40 px-3 py-1.5 text-[11px] font-semibold text-purple-200 hover:bg-purple-500/10 disabled:opacity-50"
              >
                주변 서버 찾기
              </button>
            </div>
            {discovery.message && (
              <p data-testid="server-discovery-status" className="mt-1.5 text-[10px] text-gray-400">
                {discovery.message}
              </p>
            )}
            {discovery.results.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1">
                {discovery.results.map((item) => (
                  <li key={item.wsUrl}>
                    <button
                      type="button"
                      onClick={() => setAddressInput(item.wsUrl)}
                      className="maestro-touch-control maestro-touch-control--compact w-full rounded-md border border-gray-700 px-2 py-1.5 text-left text-[11px] text-gray-200 hover:border-purple-400/50 hover:text-purple-100"
                    >
                      {item.name} <span className="font-mono text-gray-400">{item.wsUrl}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
