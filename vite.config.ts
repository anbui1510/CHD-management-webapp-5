import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {defineConfig} from 'vite';
import { APP_VERSION } from './src/appVersion';

function localDevVersionLabel(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `CHD5.${year}.${month}.${day}.001`;
}

function resolveAppBuildId(): string {
  const fromEnv = String(process.env.BUILD_ID || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('node scripts/compute-chd-version.mjs', { encoding: 'utf8' }).trim();
  } catch {
    return localDevVersionLabel();
  }
}

function stripBundledStaffSecrets() {
  return {
    name: 'strip-bundled-staff-secrets',
    enforce: 'pre' as const,
    load(id: string) {
      const normalized = id.split('?')[0].replace(/\\/g, '/');
      if (!normalized.endsWith('/data/staff.json')) return null;
      const records = JSON.parse(fs.readFileSync(normalized, 'utf8')) as Array<Record<string, unknown>>;
      const safe = records.map(staff => {
        const next: Record<string, unknown> = { ...staff, Password: '' };
        delete next.Email;
        delete next.StaffPhone;
        delete next.StaffDOB;
        return next;
      });
      return JSON.stringify(safe);
    },
  };
}

export default defineConfig(() => {
  const appBuildId = resolveAppBuildId();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [
      stripBundledStaffSecrets(),
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
          theme_color: '#171717',
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
          // Do not precache index.html — always fetch fresh HTML so new JS bundle hashes load after deploy.
          globPatterns: ['**/*.{js,css,svg,webmanifest,woff2}'],
          globIgnores: ['**/index.html'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
        '@': path.resolve(__dirname, 'src'),
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
