// Capacitor 네이티브 셸(iOS 런처) 감지 — 전역 브릿지만 확인, 신규 의존성 없음.
// 루트 앱 src/utils/server-address.js의 isNativeShell과 동일한 패턴.
export const isNativeShell = () => (
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
);
