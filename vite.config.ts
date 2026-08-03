import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';
import { APP_VERSION } from './src/appVersion';

export default defineConfig(() => {
  const appBuildId =
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
    process.env.GITHUB_SHA?.slice(0, 12) ||
    process.env.BUILD_ID ||
    'gsheets-v5';

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: 'CHD Management',
          short_name: 'CHD',
          description: 'Hệ thống quản lý bệnh nhi tim bẩm sinh',
          theme_color: '#d2145a',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          lang: 'vi',
          categories: ['medical', 'productivity'],
          icons: [
            {
              src: '/icons/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
        injectManifest: {
          globPatterns: ['**/*.{html,svg,webmanifest}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
      {
        name: 'chd-inject-html-build-id',
        transformIndexHtml(html) {
          return html.replaceAll('__CHD_BUILD_ID__', appBuildId);
        },
      },
      {
        name: 'chd-emit-version-json',
        generateBundle(_options, bundle) {
          // Skip the vite-plugin-pwa service-worker sub-build; only ship version.json with the app bundle.
          const isServiceWorkerBuild = Object.keys(bundle).every(
            (fileName) => fileName === 'sw.js' || fileName.endsWith('.map')
          );
          if (isServiceWorkerBuild) return;

          const payload = {
            version: APP_VERSION,
            buildId: appBuildId,
            buildTime: appBuildId,
          };
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: `${JSON.stringify(payload)}\n`,
          });
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
