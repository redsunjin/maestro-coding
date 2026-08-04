import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createLocalReplayBridgePlugin } from './server/localReplayBridgePlugin.js';

export default defineConfig({
  plugins: [react(), createLocalReplayBridgePlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
