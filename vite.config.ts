import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import { APP_VERSION } from './src/appVersion';

export default defineConfig(() => {
  const appBuildId =
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
    process.env.GITHUB_SHA?.slice(0, 12) ||
    process.env.BUILD_ID ||
    String(Date.now());

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'chd-emit-version-json',
        closeBundle() {
          const payload = {
            version: APP_VERSION,
            buildId: appBuildId,
            buildTime: appBuildId,
          };
          fs.writeFileSync(
            path.resolve(__dirname, 'dist/version.json'),
            `${JSON.stringify(payload)}\n`
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Always ignore data/ (the JSON DB), otherwise every save rewrites those
      // files and Vite triggers a full page reload that resets the view to Home.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**'] },
    },
  };
});
