import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalStore } from '@/store/useGlobalStore';
import {
  safeLocalGet,
  safeLocalSet,
  safeSessionGet,
  safeSessionRemove,
  safeSessionSet,
} from '@/lib/safeStorage';

const AUTO_UPDATE_SECONDS = 10;

export const OTAUpdateBanner: React.FC = () => {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState<number>(AUTO_UPDATE_SECONDS);
  const lastCheckRef = useRef<number>(0);
  const isCheckingRef = useRef<boolean>(false);

  const location = useLocation();
  const { currentUser } = useAuth();
  const isChatOpen = useGlobalStore((state) => state.isChatOpen);

  // Clean up cache-busting query params after reload so address bar stays tidy
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has('_v')) {
        url.searchParams.delete('_v');
        changed = true;
      }
      if (url.searchParams.has('_bust')) {
        url.searchParams.delete('_bust');
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }, []);

  const checkForUpdate = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < 15000 || isCheckingRef.current) {
      return;
    }
    lastCheckRef.current = now;
    isCheckingRef.current = true;

    try {
      // Ask SW in background to check for new SW file
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => {
            reg.update().catch(() => {});
          });
        }).catch(() => {});
      }

      // Single source of truth: compare server version.json against compiled VITE_APP_VERSION
      const response = await fetch(`/version.json?_t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        return;
      }
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        return;
      }

      const data = await response.json();
      const remoteVersion = data?.version ? String(data.version).trim() : null;
      if (!remoteVersion) return;

      const runningVersion = ((import.meta as any).env?.VITE_APP_VERSION || '').trim();
      const localVersion = runningVersion || safeLocalGet('app_version') || '';

      // If we are already running the remote version, clear any old OTA flags and keep banner hidden
      if (localVersion && remoteVersion === localVersion) {
        safeLocalSet('app_version', remoteVersion);
        safeSessionRemove('ota_just_updated_version');
        safeSessionRemove('ota_just_updated_at');
        setNewVersion(null);
        return;
      }

      // Guard against infinite reload loop if user just clicked update for this version within last 25s
      const justUpdatedVer = safeSessionGet('ota_just_updated_version');
      const justUpdatedAt = Number(safeSessionGet('ota_just_updated_at') || '0');
      if (justUpdatedVer === remoteVersion && now - justUpdatedAt < 25000) {
        return;
      }

      if (localVersion && remoteVersion !== localVersion && import.meta.env.PROD) {
        setNewVersion((prev) => {
          if (prev !== remoteVersion) {
            setCountdown(AUTO_UPDATE_SECONDS);
            setDismissed(false);
          }
          return remoteVersion;
        });
      } else if (runningVersion) {
        safeLocalSet('app_version', runningVersion);
      }
    } catch (_) {
      // Silently ignore network errors
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          checkForUpdate();
        });
      } else {
        checkForUpdate();
      }
    }, 1500);

    const handleSwUpdateEvent = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const runningBuildTime = ((import.meta as any).env?.VITE_BUILD_TIME || '').trim();
      // If the newly activated SW matches our running bundle, do NOT re-show update banner
      if (detail?.version && runningBuildTime && String(detail.version) === runningBuildTime) {
        return;
      }
      lastCheckRef.current = 0;
      checkForUpdate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    const handleFocus = () => {
      checkForUpdate();
    };

    window.addEventListener('next_sw_updated', handleSwUpdateEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('next_sw_updated', handleSwUpdateEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkForUpdate]);

  const handleUpdate = useCallback(async () => {
    if (isUpdating || !newVersion) return;
    setIsUpdating(true);

    try {
      // Record that we triggered update to this target version to prevent any re-prompt loop
      safeSessionSet('ota_just_updated_version', newVersion);
      safeSessionSet('ota_just_updated_at', String(Date.now()));
      if (newVersion !== 'latest') {
        safeLocalSet('app_version', newVersion);
      }

      // 1. Clear Cache Storage (IndexedDB / Dexie / Auth remain untouched)
      if ('caches' in window && window.caches) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
        } catch (_) {}
      }

      // 2. Activate waiting SW or unregister stale SWs
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            if (registration.waiting) {
              try {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              } catch (_) {}
            }
            await registration.unregister();
          }
        } catch (_) {}
      }

      // 3. Force browser HTTP cache to fetch fresh index.html before navigating
      try {
        await fetch(window.location.pathname || '/', {
          cache: 'reload',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
      } catch (_) {}

      // 4. Hard replace preserving current route with cache-buster
      const bustUrl = new URL(window.location.href);
      bustUrl.searchParams.set('_v', String(Date.now()));
      window.location.replace(bustUrl.toString());
    } catch (err) {
      console.error('Error during OTA update:', err);
      const fallbackPath = (window.location.pathname || '/') + (window.location.search || '');
      const sep = fallbackPath.includes('?') ? '&' : '?';
      window.location.replace(`${window.location.origin}${fallbackPath}${sep}_v=${Date.now()}${window.location.hash || ''}`);
    }
  }, [isUpdating, newVersion]);

  const isMessages = location.pathname.startsWith('/messages');
  const isProtectedActivity =
    location.pathname.startsWith('/cinema') ||
    location.pathname.startsWith('/meet') ||
    location.pathname.startsWith('/upload') ||
    (isMessages && isChatOpen);

  // 10-second Auto-Update countdown when banner is visible (paused during Cinema/Meet/Upload/active Chat so user is never kicked mid-session)
  useEffect(() => {
    if (!newVersion || dismissed || isUpdating || isProtectedActivity) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [newVersion, dismissed, isUpdating, isProtectedActivity]);

  useEffect(() => {
    if (newVersion && !dismissed && !isUpdating && !isProtectedActivity && countdown === 0) {
      handleUpdate();
    }
  }, [countdown, newVersion, dismissed, isUpdating, isProtectedActivity, handleUpdate]);

  if (!newVersion || dismissed) {
    return null;
  }

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const hasBottomNav = !isAuthPage && !(isMessages && isChatOpen);
  const bottomPositionClass = hasBottomNav
    ? 'bottom-20 md:bottom-6'
    : 'bottom-4 md:bottom-6';

  return (
    <div
      id="ota-update-banner"
      role="alert"
      className={`fixed ${bottomPositionClass} left-1/2 -translate-x-1/2 z-[120] w-[94%] max-w-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-5`}
    >
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md text-gray-900 dark:text-white rounded-2xl shadow-2xl border border-blue-500/30 p-3.5 sm:p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center shrink-0 text-[#1877F2]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              A new update is available
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {isUpdating
                ? `Installing version ${newVersion}...`
                : isProtectedActivity
                ? `Version ${newVersion} • Tap Update when ready`
                : `Version ${newVersion} • Auto-updating in ${countdown}s`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="ota-update-now-btn"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="bg-[#1877F2] hover:bg-blue-600 active:scale-95 text-white text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-70 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'Updating...' : isProtectedActivity ? 'Update' : `Update (${countdown}s)`}</span>
          </button>
          <button
            id="ota-dismiss-btn"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update banner"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OTAUpdateBanner;
