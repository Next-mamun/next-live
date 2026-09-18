import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalStore } from '@/store/useGlobalStore';

export const OTAUpdateBanner: React.FC = () => {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckRef = useRef<number>(0);
  const isCheckingRef = useRef<boolean>(false);

  const { currentUser } = useAuth();
  const isChatOpen = useGlobalStore((state) => state.isChatOpen);

  const checkForUpdate = useCallback(async () => {
    // Throttle checks to avoid excessive network calls (minimum 15s interval)
    const now = Date.now();
    if (now - lastCheckRef.current < 15000 || isCheckingRef.current) {
      return;
    }
    lastCheckRef.current = now;
    isCheckingRef.current = true;

    try {
      // Non-blocking fetch with no-cache to bypass browser memory & disk cache
      const response = await fetch(`/version.json?_t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        isCheckingRef.current = false;
        return;
      }

      const data = await response.json();
      const remoteVersion = data?.version ? String(data.version).trim() : null;

      if (!remoteVersion) {
        isCheckingRef.current = false;
        return;
      }

      const localVersion = localStorage.getItem('app_version');

      if (!localVersion) {
        // Initial setup: Seed localStorage with current remote version
        localStorage.setItem('app_version', remoteVersion);
      } else if (localVersion !== remoteVersion) {
        // New OTA version detected!
        setNewVersion(remoteVersion);
        setDismissed(false);
      }
    } catch (err) {
      // Silently ignore network failures to ensure zero impact on app usage
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // 1. Asynchronously schedule initial check without blocking app startup
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          checkForUpdate();
        });
      } else {
        checkForUpdate();
      }
    }, 2000);

    // 2. Check on window focus and visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    const handleFocus = () => {
      checkForUpdate();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // 3. Periodic background check every 5 minutes
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkForUpdate]);

  const handleUpdate = async () => {
    if (isUpdating || !newVersion) return;
    setIsUpdating(true);

    try {
      // a. Unregister Service Workers if present
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        } catch (swErr) {
          console.warn('Failed to unregister service worker:', swErr);
        }
      }

      // b. Clear static Cache Storage (IndexedDB/Dexie data remains 100% UNTOUCHED and SAFE)
      if ('caches' in window && window.caches) {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
        } catch (cacheErr) {
          console.warn('Failed to clear caches:', cacheErr);
        }
      }

      // c. Save the new version string to localStorage
      localStorage.setItem('app_version', newVersion);

      // d. Perform a hard reload to fresh origin with cache-busting parameter
      window.location.href = window.location.origin + '?v=' + Date.now();
    } catch (err) {
      console.error('Error during OTA update:', err);
      // Fallback reload
      window.location.href = window.location.origin + '?v=' + Date.now();
    }
  };

  if (!newVersion || dismissed) {
    return null;
  }

  // Adjust bottom spacing on mobile when bottom navigation bar is visible
  const hasBottomNav = currentUser && !isChatOpen;
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
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate flex items-center gap-1.5">
              <span>🚀 A new update for Next is available!</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Version {newVersion} is ready to apply.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="ota-update-now-btn"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="bg-[#1877F2] hover:bg-blue-600 active:scale-95 text-white text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-70 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'Updating...' : 'Update Now'}</span>
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
