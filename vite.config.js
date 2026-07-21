import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // 네이티브(Capacitor) 빌드는 capacitor://localhost/ 루트에서 로드되므로 상대 base 사용
  base: process.env.CAPACITOR_BUILD ? './' : '/maestro-coding/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    include: ['src/**/*.ui.test.jsx', 'src/**/*.test.js'],
  },
})
