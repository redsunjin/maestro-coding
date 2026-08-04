import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, 'extension');
const extensionDistRoot = path.resolve(__dirname, 'dist-extension');

function copyExtensionManifest() {
  const manifestPath = path.resolve(extensionRoot, 'manifest.json');

  return {
    name: 'copy-extension-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: readFileSync(manifestPath, 'utf8'),
      });
    },
  };
}

export default defineConfig({
  root: extensionRoot,
  base: './',
  plugins: [react(), copyExtensionManifest()],
  build: {
    outDir: extensionDistRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(extensionRoot, 'popup.html'),
        player: path.resolve(extensionRoot, 'player.html'),
        background: path.resolve(extensionRoot, 'background.js'),
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }

          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
