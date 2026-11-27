import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

import type { Plugin } from 'vite';

function oklabToRgbaString(lRaw: string, aRaw: string, bRaw: string, alphaRaw?: string): string | null {
  let L = parseFloat(lRaw);
  if (Number.isNaN(L)) return null;
  if (lRaw.trim().endsWith('%')) L /= 100;

  let a = parseFloat(aRaw);
  let b = parseFloat(bRaw);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  if (aRaw.trim().endsWith('%')) a = (a / 100) * 0.4;
  if (bRaw.trim().endsWith('%')) b = (b / 100) * 0.4;

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const toSrgbByte = (x: number) => {
    const clamped = Math.max(0, Math.min(1, x));
    const encoded = clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(255, encoded * 255)));
  };

  const r = toSrgbByte(rLin);
  const g = toSrgbByte(gLin);
  const bl = toSrgbByte(bLin);

  if (alphaRaw !== undefined && alphaRaw.trim() !== '') {
    let alpha = parseFloat(alphaRaw);
    if (Number.isNaN(alpha)) return null;
    if (alphaRaw.trim().endsWith('%')) alpha /= 100;
    alpha = Math.max(0, Math.min(1, alpha));
    const alphaStr = Number(alpha.toFixed(4)).toString();
    return `rgba(${r}, ${g}, ${bl}, ${alphaStr})`;
  }

  return `rgb(${r}, ${g}, ${bl})`;
}

function oklchToRgbaString(lRaw: string, cRaw: string, hRaw: string, alphaRaw?: string): string | null {
  let L = parseFloat(lRaw);
  if (Number.isNaN(L)) return null;
  if (lRaw.trim().endsWith('%')) L /= 100;

  const C = parseFloat(cRaw);
  const H = parseFloat(hRaw);
  if (Number.isNaN(C) || Number.isNaN(H)) return null;

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgbaString(String(L), String(a), String(b), alphaRaw);
}

function unwrapAtLayerBlocks(css: string): string {
  // Remove top-level or nested `@layer foo, bar;` forward declarations
  let input = css;
  let result = '';
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip comments safely
    if (input[i] === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) {
        result += input.slice(i);
        break;
      }
      result += input.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Preserve string literals
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let j = i + 1;
      while (j < len) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      result += input.slice(i, j);
      i = j;
      continue;
    }

    // Detect `@layer` keyword
    if (
      input[i] === '@' &&
      input.slice(i, i + 6).toLowerCase() === '@layer' &&
      (i + 6 >= len || /[\s{;]/.test(input[i + 6]))
    ) {
      let j = i + 6;
      while (j < len && input[j] !== '{' && input[j] !== ';') {
        j += 1;
      }
      if (j < len && input[j] === ';') {
        // Drop `@layer a, b, c;` declaration statement
        i = j + 1;
        continue;
      }
      if (j < len && input[j] === '{') {
        // Find matching closing brace for `@layer ... { ... }`
        let depth = 1;
        let k = j + 1;
        while (k < len && depth > 0) {
          const ch = input[k];
          if (ch === '/' && input[k + 1] === '*') {
            const cEnd = input.indexOf('*/', k + 2);
            if (cEnd === -1) break;
            k = cEnd + 2;
            continue;
          }
          if (ch === '"' || ch === "'") {
            const q = ch;
            k += 1;
            while (k < len) {
              if (input[k] === '\\') {
                k += 2;
                continue;
              }
              if (input[k] === q) {
                k += 1;
                break;
              }
              k += 1;
            }
            continue;
          }
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
          k += 1;
        }
        const inner = input.slice(j + 1, Math.max(j + 1, k - 1));
        result += unwrapAtLayerBlocks(inner);
        i = k;
        continue;
      }
    }

    result += input[i];
    i += 1;
  }

  return result;
}

function parseColorTokenToRgba(token: string, paletteMap: Map<string, [number, number, number, number]>): [number, number, number, number] | null {
  const t = token.trim();
  if (t === 'white') return [255, 255, 255, 1];
  if (t === 'black') return [0, 0, 0, 1];

  const varMatch = t.match(/^var\(\s*(--color-[a-zA-Z0-9-]+)\s*\)$/);
  if (varMatch && paletteMap.has(varMatch[1])) {
    return paletteMap.get(varMatch[1])!;
  }

  const rgbaMatch = t.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgbaMatch) {
    return [
      Number(rgbaMatch[1]),
      Number(rgbaMatch[2]),
      Number(rgbaMatch[3]),
      rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    ];
  }

  if (t.startsWith('#')) {
    const hex = t.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ];
    }
  }

  return null;
}

function transformCssForWebViewCompat(css: string): string {
  // 1. Unwrap @layer blocks so Android System WebView < Chrome 99 doesn't drop all Tailwind utilities
  let out = unwrapAtLayerBlocks(css);

  // 2. Convert oklch(L C H [/ A]) and oklab(L a b [/ A]) literals to rgb()/rgba() for Chrome < 111 WebViews
  out = out.replace(
    /oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)(?:\s*\/\s*([^)]+))?\s*\)/gi,
    (match, l, c, h, a) => oklchToRgbaString(l, c, h, a) ?? match
  );
  out = out.replace(
    /oklab\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)(?:\s*\/\s*([^)]+))?\s*\)/gi,
    (match, l, a, b, alpha) => oklabToRgbaString(l, a, b, alpha) ?? match
  );

  // 3. Collect static palette --color-* RGBA tuples
  const paletteMap = new Map<string, [number, number, number, number]>();
  const varDefRegex = /(--color-[a-zA-Z0-9-]+)\s*:\s*([^;}{]+)\s*[;}]/g;
  let m: RegExpExecArray | null;
  while ((m = varDefRegex.exec(out)) !== null) {
    const parsed = parseColorTokenToRgba(m[2], paletteMap);
    if (parsed) {
      paletteMap.set(m[1], parsed);
    }
  }

  // 4. Convert static color-mix(in oklab/srgb, <color> <pct>%, transparent) to rgba() for Chrome < 111
  out = out.replace(
    /color-mix\(\s*in\s+(?:oklab|srgb)\s*,\s*(var\([^)]+\)|#[0-9a-fA-F]{3,6}|rgba?\([^)]+\)|white|black)\s+([0-9.]+)%\s*,\s*transparent\s*\)/gi,
    (match, colorToken, pctRaw) => {
      const rgba = parseColorTokenToRgba(colorToken, paletteMap);
      const pct = parseFloat(pctRaw);
      if (!rgba || Number.isNaN(pct)) return match;
      const alpha = Number(Math.max(0, Math.min(1, rgba[3] * (pct / 100))).toFixed(4));
      return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${alpha})`;
    }
  );

  return out;
}

function webviewCssCompatPlugin(): Plugin {
  return {
    name: 'webview-css-compat',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith('.css')) continue;
        const asset = bundle[fileName];
        if (asset && asset.type === 'asset' && typeof asset.source === 'string') {
          asset.source = transformCssForWebViewCompat(asset.source);
        }
      }
    },
  };
}

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
        webviewCssCompatPlugin(),
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
      build: {
        target: ['chrome79', 'edge79', 'firefox75', 'safari13.1'],
        cssTarget: ['chrome79', 'safari13.1'],
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('/three/')) return 'vendor-three';
                if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase';
                if (id.includes('/@supabase/')) return 'vendor-supabase';
                if (id.includes('/@tanstack/')) return 'vendor-tanstack';
                if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'vendor-motion';
                if (id.includes('/lucide-react/')) return 'vendor-icons';
                if (id.includes('/dexie')) return 'vendor-dexie';
                if (id.includes('/peerjs')) return 'vendor-peerjs';
                if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/')) {
                  return 'vendor-react';
                }
              }
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
