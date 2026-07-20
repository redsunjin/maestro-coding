import {
  DEFAULT_LANE_COUNT,
  MAX_LANE_COUNT,
  formatLaneKeyLabel,
  getLaneDefinitions,
  normalizeLaneIndex,
  sanitizeLaneCount,
} from '../../shared/lane-config.mjs';

// WebSocket 서버 주소 (maestro-server.js 가 실행되는 호스트)
// 환경변수 VITE_WS_URL 로 재정의할 수 있습니다.
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

export const BACH_CHANNEL_STORAGE_KEY = 'maestro.function-bach.channel-url';
export const BACH_VOLUME_STORAGE_KEY = 'maestro.function-bach.volume';
export const DEFAULT_BACH_CHANNEL_URL = 'https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w';
export const YOUTUBE_URL_HELP_TEXT = '채널 URL은 /channel/UC... 형식 또는 재생목록/영상 URL을 사용하세요.';

export { DEFAULT_LANE_COUNT, MAX_LANE_COUNT, formatLaneKeyLabel, getLaneDefinitions, normalizeLaneIndex, sanitizeLaneCount };

export const LANES = getLaneDefinitions(DEFAULT_LANE_COUNT);

export const PROJECTS = [
  { id: 'proj_b2c', name: '🚀 B2C Service App' },
  { id: 'proj_admin', name: '⚙️ Admin Backoffice' },
  { id: 'proj_api', name: '🔌 Core API Gateway' },
];

export const MOCK_COMMITS = [
  { title: "JWT 토큰 검증 최적화", diff: "@@ -45,8 +45,12 @@\n- const verify = (token) => { return jwt.decode(token); }\n+ const verify = async (token) => {\n+   const decoded = await jwt.verify(token, process.env.SECRET);\n+   return decoded;\n+ }" },
  { title: "React 렌더링 개선", diff: "@@ -12,4 +12,5 @@\n- export default UserList;\n+ export default React.memo(UserList);" },
  { title: "사용자 테이블 인덱스", diff: "@@ -1,3 +1,4 @@\n CREATE TABLE users (\n   id INT PRIMARY KEY,\n-  email VARCHAR(255)\n+  email VARCHAR(255),\n+  INDEX idx_email (email)\n );" },
  { title: "프롬프트 시스템 미세조정", diff: "@@ -88,2 +88,2 @@\n- const prompt = `You are a helpful assistant.`;\n+ const prompt = `You are an expert developer. Always output valid JSON.`;" },
  { title: "모바일 네비게이션 픽스", diff: "@@ -20,3 +20,3 @@\n- <nav className=\"hidden md:flex\">\n+ <nav className=\"flex flex-col md:flex-row\">\n    <Links />\n  </nav>" },
  { title: "Redis 캐싱 레이어 도입", diff: "@@ -50,2 +50,5 @@\n  const data = await db.query(sql);\n+ await redis.set(cacheKey, JSON.stringify(data), 'EX', 3600);\n  return data;" },
];

export const BASE_BOTTOM = 180; // 기준선 위치 (화면 하단 기준 픽셀)
export const NOTE_HEIGHT_OFFSET = 85; // 노트가 쌓이는 간격
export const NOTE_SPEED = 14; // 노트 낙하 속도 (픽셀/프레임)
export const SPAWN_BOTTOM = 1000; // 노트 시작 위치 (바닥 기준)

export const NOTE_STATUS = {
  READY: 'ready',
  APPROVING: 'approving',
  REJECTING: 'rejecting',
};

// 타이밍 판정 튜닝 상수 — 게임 점수/콤보 전용, 실제 머지/반려에는 영향 없음
export const JUDGMENT = {
  GREAT_WINDOW_PX: 120, // 판정선까지 이 거리 이내면 GREAT
  LATE_GRACE_MS: 4000, // 판정선 도달 후 이 시간 이내면 PERFECT, 초과 시 LATE
  SCORES: {
    PERFECT: 100,
    GREAT: 70,
    EARLY: 40,
    LATE: 10,
  },
};

export const LANE_HIT_FREQS = [261.63, 329.63, 392.00, 523.25, 587.33, 659.25, 783.99, 880.00];
