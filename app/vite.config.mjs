import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: resolve(import.meta.dirname, 'dist/renderer'), emptyOutDir: true, chunkSizeWarningLimit: 1100 },
});
