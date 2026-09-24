import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@osint-globe/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Allow Vite to read the linked workspace package source outside apps/web.
    fs: { allow: ['../..'] },
  },
});
