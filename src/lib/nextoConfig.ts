import { safeLocalGet, safeLocalSet } from './safeStorage';

export * from './nextoEmotes';

export type NextoRobotMode = '3d' | '2d';
export const DEFAULT_ROBOT_MODE: NextoRobotMode = '3d';

export const MIN_ROBOT_BRIGHTNESS = 60;
export const MAX_ROBOT_BRIGHTNESS = 155;
export const DEFAULT_ROBOT_BRIGHTNESS = MAX_ROBOT_BRIGHTNESS;

export const NEXTO_POSTER_CACHE_KEY = 'nexto_3d_poster_v1';

// Shared GLB binary cache so the 3D model fetches lazily only when requested
let glbArrayBufferPromise: Promise<ArrayBuffer> | null = null;

export function preloadNextoGlbBuffer(): Promise<ArrayBuffer> {
  if (!glbArrayBufferPromise) {
    glbArrayBufferPromise = fetch('/nexto-final.glb', {
      cache: 'force-cache',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .catch((err) => {
        glbArrayBufferPromise = null;
        throw err;
      });
  }
  return glbArrayBufferPromise;
}

export function clearPreloadedNextoGlbBuffer(): void {
  glbArrayBufferPromise = null;
}

let staticSnapshotCache: string | null = null;

export function getCachedNextoPosterSync(): string | null {
  if (staticSnapshotCache) return staticSnapshotCache;
  if (typeof window === 'undefined') return null;
  try {
    const cached = safeLocalGet(NEXTO_POSTER_CACHE_KEY);
    if (cached && cached.startsWith('data:image/')) {
      staticSnapshotCache = cached;
      return cached;
    }
  } catch {}
  return null;
}

export function saveCachedNextoPoster(dataUrl: string): void {
  staticSnapshotCache = dataUrl;
  if (typeof window === 'undefined') return;
  try {
    safeLocalSet(NEXTO_POSTER_CACHE_KEY, dataUrl);
  } catch {}
}
