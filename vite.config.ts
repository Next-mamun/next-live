import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildTime = Date.now().toString();
    const autoVersion = `1.0.${buildTime.slice(-6)}`;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        {
          name: 'auto-version-manifest',
          generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: 'version.json',
              source: JSON.stringify({ version: autoVersion, buildTime }, null, 2),
            });
          },
        },
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          registerType: 'prompt',
          manifest: false,
          injectManifest: {
            // Keep precache ultra-lightweight (< 150 KB) so old PWAs update in < 0.3s instead of stalling on 44 MB AI shards
            maximumFileSizeToCacheInBytes: 500000,
            globPatterns: ['favicon.ico', 'pwa-*.png', 'maskable-icon-512x512.png', 'apple-touch-icon.png', 'manifest.json'],
            globIgnores: ['**/index.html', '**/group1-shard*', '**/model.min-*']
          }
        })
      ],
      define: {
        'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(autoVersion)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
