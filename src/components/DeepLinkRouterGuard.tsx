import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface DeepLinkRouterGuardProps {
  children: React.ReactNode;
}

/**
 * DeepLinkRouterGuard
 * 
 * Prevents blank screens in Android WebView/App when opened via Deep Links:
 * 1. Reads initial window.location (pathname + search + hash) on startup.
 * 2. Forces React Router to navigate to the exact captured deep link path.
 * 3. Shows a smooth loading splash screen until the target route is mounted.
 * 4. Only activates if running inside the Android App / WebView to keep web behavior untouched.
 */
export const DeepLinkRouterGuard: React.FC<DeepLinkRouterGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasResolvedRef = useRef(false);

  // Android App / WebView identification
  const isAndroidApp = typeof navigator !== 'undefined' && (
    navigator.userAgent.includes('Next') ||
    navigator.userAgent.includes('wv') ||
    /Android.*Version\/[0-9.]+/i.test(navigator.userAgent)
  );

  // If on Android App, start in a resolving state to prevent blank white screen
  const [isResolving, setIsResolving] = useState<boolean>(() => isAndroidApp);

  useEffect(() => {
    // Keep normal web browser behavior untouched
    if (!isAndroidApp) {
      setIsResolving(false);
      return;
    }

    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;

    try {
      // 1. Initialization Fix: Capture exact initial path and query from window.location
      const rawPath = window.location.pathname || '/';
      const rawSearch = window.location.search || '';
      const rawHash = window.location.hash || '';
      const fullTarget = `${rawPath}${rawSearch}${rawHash}`;

      const currentRouterTarget = `${location.pathname}${location.search}${location.hash}`;

      // If a non-root deep link was targeted and router hasn't synced it yet
      if (fullTarget && fullTarget !== '/' && fullTarget !== currentRouterTarget) {
        navigate(fullTarget, { replace: true });
      }
    } catch (err) {
      console.warn('[DeepLinkRouterGuard] Error navigating to deep link:', err);
    } finally {
      // Allow router to mount the destination route component smoothly
      const timer = setTimeout(() => {
        setIsResolving(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isAndroidApp, navigate]);

  // 2. Blank Screen Prevention: Display dedicated splash/loading component during resolution
  if (isResolving) {
    return (
      <div 
        id="deep-link-splash"
        className="fixed inset-0 z-[99999] bg-[#f0f2f5] dark:bg-[#000000] flex flex-col items-center justify-center select-none"
      >
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-4 border-gray-200 dark:border-gray-800 border-t-[#1877F2] animate-spin" />
            <div className="absolute w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
              <span className="text-[#1877F2] font-black text-sm">N</span>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-300 font-bold text-sm tracking-wide animate-pulse">
            Opening Next...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default DeepLinkRouterGuard;
