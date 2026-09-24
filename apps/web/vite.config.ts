import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { fileURLToPath } from 'node:url';

// npm workspaces hoist cesium to the repo root, not apps/web/node_modules.
const cesiumBuild = fileURLToPath(new URL('../../node_modules/cesium/Build', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    cesium({ cesiumBuildRootPath: cesiumBuild, cesiumBuildPath: `${cesiumBuild}/Cesium/` }),
  ],
  // Read VITE_* keys from the single .env at the repo root.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
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
