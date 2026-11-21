import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { normalizeAppRoute } from '@/lib/utils';

interface DeepLinkRouterGuardProps {
  children: React.ReactNode;
}

const extractChatUserIdFromRoute = (route: string): string | null => {
  try {
    const parsed = new URL(route, 'https://next-nexto.vercel.app');
    if (parsed.pathname.startsWith('/messages')) {
      const qUser = parsed.searchParams.get('user') || parsed.searchParams.get('userId') || parsed.searchParams.get('chatId');
      if (qUser) return qUser;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'messages') {
        return parts[1];
      }
    }
  } catch (_) {}
  return null;
};

/**
 * DeepLinkRouterGuard
 * 
 * Ensures reliable cold-start & warm-start deep linking across Web, PWA, and Android WebView/App:
 * 1. Captures initial window.location (pathname + search + hash) and syncs React Router cleanly.
 * 2. Exposes global native-to-web deep link bridges (window.__handleDeepLink / window.handleDeepLink / next_deep_link).
 * 3. Shows a brief resolving overlay inside the Android App WebView to prevent blank white flashes.
 */
export const DeepLinkRouterGuard: React.FC<DeepLinkRouterGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasResolvedRef = useRef(false);

  const isAndroidApp = typeof navigator !== 'undefined' && (
    Boolean((window as any).AndroidApp) ||
    navigator.userAgent.includes('Next') ||
    navigator.userAgent.includes('wv') ||
    /Android.*Version\/[0-9.]+/i.test(navigator.userAgent)
  );

  const [isResolving, setIsResolving] = useState<boolean>(() => isAndroidApp);

  const routeDeepLink = useCallback((rawUrl: string) => {
    const targetRoute = normalizeAppRoute(rawUrl);
    if (!targetRoute) return;
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (targetRoute !== currentRoute) {
      navigate(targetRoute);
    }
    const chatUserId = extractChatUserIdFromRoute(targetRoute);
    if (chatUserId) {
      window.dispatchEvent(new CustomEvent('open_chat_direct', {
        detail: { userId: chatUserId, liveProposal: targetRoute.includes('liveProposal=1') }
      }));
    }
  }, [navigate]);

  // Register global warm-start deep link handlers for Android WebView / native shell
  useEffect(() => {
    const handleCustomEvent = (e: Event) => {
      const custom = e as CustomEvent;
      const url = typeof custom?.detail === 'string' ? custom.detail : custom?.detail?.url;
      if (url) routeDeepLink(url);
    };

    (window as any).__handleDeepLink = routeDeepLink;
    (window as any).handleDeepLink = routeDeepLink;
    window.addEventListener('next_deep_link', handleCustomEvent);

    return () => {
      delete (window as any).__handleDeepLink;
      delete (window as any).handleDeepLink;
      window.removeEventListener('next_deep_link', handleCustomEvent);
    };
  }, [routeDeepLink]);

  useEffect(() => {
    if (!isAndroidApp) {
      setIsResolving(false);
      return;
    }

    if (!hasResolvedRef.current) {
      hasResolvedRef.current = true;
      try {
        const rawPath = window.location.pathname || '/';
        const rawSearch = window.location.search || '';
        const rawHash = window.location.hash || '';
        const fullTarget = normalizeAppRoute(`${rawPath}${rawSearch}${rawHash}`);
        const currentRouterTarget = `${location.pathname}${location.search}${location.hash}`;

        if (fullTarget && fullTarget !== '/' && fullTarget !== currentRouterTarget) {
          navigate(fullTarget, { replace: true });
        }
      } catch (err) {
        console.warn('[DeepLinkRouterGuard] Error navigating to deep link:', err);
      }
    }

    const timer = setTimeout(() => {
      setIsResolving(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [isAndroidApp, navigate, location.pathname, location.search, location.hash]);

  if (isResolving) {
    return (
      <div 
        id="deep-link-splash"
        className="fixed inset-0 z-[99999] bg-[#f0f2f5] dark:bg-[#000000] flex flex-col items-center justify-center select-none"
      >
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-800 border-t-[#1877F2] animate-spin" />
            <img
              src="/Next-AppLogo.jpg"
              alt="Next"
              className="absolute w-11 h-11 rounded-full object-cover shadow-sm"
            />
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
