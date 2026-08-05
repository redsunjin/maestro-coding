// VS Code 확장의 서버 라이프사이클 상태 머신 (vscode 비의존 — 단위 테스트 대상).
// embed는 lib/server-embed.mjs의 startMaestroServer(또는 테스트 대역)를 주입받는다.

function createLifecycle({ embed }) {
  if (typeof embed !== 'function') {
    throw new Error('embed 함수가 필요합니다');
  }

  let handle = null;
  let starting = null;

  return {
    async start(options = {}) {
      if (handle) return handle;
      if (starting) return starting;

      starting = embed(options)
        .then((nextHandle) => {
          handle = nextHandle;
          return nextHandle;
        })
        .finally(() => {
          starting = null;
        });
      return starting;
    },

    async stop() {
      if (!handle) return;
      const current = handle;
      handle = null;
      await current.stop();
    },

    status() {
      if (!handle) {
        return { state: 'idle' };
      }
      return {
        state: 'running',
        url: handle.url,
        port: handle.port,
        pid: handle.pid,
        reused: Boolean(handle.alreadyRunning),
      };
    },
  };
}

module.exports = { createLifecycle };
