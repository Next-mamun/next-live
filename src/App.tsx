
import React, { useState, useEffect, createContext, useContext, Suspense, lazy, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import NextoRobot from '@/components/NextoRobot';
import OTAUpdateBanner from '@/components/OTAUpdateBanner';
import { UserProfile as User } from '@/types';
import { auth, db } from '@/lib/firebase';
import { generateBio } from '@/services/geminiService';
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { localDB, getBase64Image } from '@/lib/dexie';
import { syncProfileToSupabase, ensureUniqueUsername, backfillPublicProfilesOnce, fetchProfileSmart, cacheUserInDexie } from '@/lib/profileSync';
import { useWakeLock } from '@/hooks/useWakeLock';
import { requestNotificationPermission, flushPendingFCMToken, playNotificationSound, showInAppNotificationToast, listenForegroundMessages, isMessageAlertsEnabled, isMentionAlertsEnabled } from '@/services/notificationService';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { normalizeAppRoute, isChatMuted } from '@/lib/utils';
import {
  AUTO_LOGIN_REINSTALL_KEY,
  consumePendingReinstallLogout,
  enforceFreshLoginAfterReinstall,
  isAutoLoginOnReinstallEnabled,
  isStandaloneMode,
  markPwaInstalled,
  setAutoLoginOnReinstallEnabled,
} from '@/lib/pwaInstallAuth';

const safeGetStoredUser = (): User | null => {
  try {
    const saved = localStorage.getItem('next_media_user');
    if (!saved || saved === 'undefined' || saved === 'null') return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;
    if ('password' in parsed) {
      const { password: _removed, ...clean } = parsed;
      localStorage.setItem('next_media_user', JSON.stringify(clean));
      return clean as User;
    }
    return parsed as User;
  } catch (_) {
    try { localStorage.removeItem('next_media_user'); } catch {}
    return null;
  }
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
};

const extractChatUserIdFromTarget = (route: string): string | null => {
  try {
    const parsed = new URL(route, 'https://next-nexto.vercel.app');
    if (parsed.pathname.startsWith('/messages')) {
      const qUser = parsed.searchParams.get('user') || parsed.searchParams.get('userId') || parsed.searchParams.get('chatId');
      if (qUser) return qUser;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'messages') return parts[1];
    }
  } catch (_) {}
  return null;
};

const AuthRouteRedirect: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const rawReturn = params.get('returnUrl');
  const target = rawReturn ? normalizeAppRoute(rawReturn) : '/';
  const safeTarget = (target.startsWith('/login') || target.startsWith('/register')) ? '/' : target;
  return <Navigate to={safeTarget} replace />;
};

// Note: Chunk loading recovery is handled safely in src/index.tsx with external script & protected-route guards.

// Primary core navigation routes imported directly for instant 0ms switching regardless of Home Feed state
import Feed from '@/pages/Feed';
import Messages from '@/pages/Messages';
import Friends from '@/pages/Friends';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
import CreatePost from '@/pages/CreatePost';
import Lab from '@/pages/Lab';
import Cinema from '@/pages/Cinema';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import DeepLinkRouterGuard from '@/components/DeepLinkRouterGuard';
import { AuthBottomSheet } from '@/components/AuthBottomSheet';
import { GuestLockedView } from '@/components/GuestLockedView';

// Safe lazy loader for secondary routes
const safeLazy = (importFn: () => Promise<any>) =>
  lazy(async () => {
    try {
      return await importFn();
    } catch (err: any) {
      console.warn('⚠️ [SafeLazy] Chunk loading failed, auto-cleaning cache and reloading...', err);
      if ('caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n)));
        } catch (_) {}
      }
      const reloadKey = 'safe_lazy_reload_' + window.location.pathname;
      const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
        return new Promise(() => {}); // Hold execution until reload
      }
      throw err;
    }
  });

const Reels = safeLazy(() => import('@/pages/Reels'));
const Meet = safeLazy(() => import('@/pages/Meet'));
const ChildSafety = safeLazy(() => import('@/pages/ChildSafety'));
const Features = safeLazy(() => import('@/pages/Features'));

// Preload helper for secondary lazy routes on hover/pointer-down
export const preloadAppRoute = (route: string) => {
  const clean = route.replace(/^\//, '').split('/')[0];
  switch (clean) {
    case 'reels': import('@/pages/Reels'); break;
    case 'meet': import('@/pages/Meet'); break;
    case 'features': import('@/pages/Features'); break;
    case 'child-safety': import('@/pages/ChildSafety'); break;
  }
};
if (typeof window !== 'undefined') {
  (window as any).__preloadAppRoute = preloadAppRoute;
}

import { useGlobalStore } from '@/store/useGlobalStore';
import { AuthContext, AuthContextType, ThemeContext, ThemeContextType, useAuth, useTheme } from '@/contexts/AuthContext';

const AppLayout: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isMessages = location.pathname.startsWith('/messages');
  const isCinema = location.pathname.startsWith('/cinema');
  const isMeet = location.pathname.startsWith('/meet');
  const isLockedViewportPage = isMessages || isCinema || isMeet;
  const isChatOpen = useGlobalStore(state => state.isChatOpen);
  const setIsChatOpen = useGlobalStore(state => state.setIsChatOpen);

  useEffect(() => {
    if (isAuthPage) {
      useGlobalStore.getState().closeAuthModal();
    }
  }, [isAuthPage]);

  // Global navigator for push notification clicks & Android native bridge
  useEffect(() => {
    const navigateToAppUrl = (rawUrl: string) => {
      const target = normalizeAppRoute(rawUrl);
      const chatUid = extractChatUserIdFromTarget(target);
      const hasLiveProposal = target.includes('liveProposal=1');
      if (chatUid && hasLiveProposal) {
        useGlobalStore.getState().setPendingLiveProposal({
          senderId: chatUid,
          senderName: 'Friend',
          timestamp: Date.now()
        });
      }
      navigate(target);
      if (chatUid) {
        window.dispatchEvent(new CustomEvent('open_chat_direct', { detail: { userId: chatUid, liveProposal: hasLiveProposal } }));
      }
    };
    (window as any).__appNavigate = navigateToAppUrl;
    return () => {
      delete (window as any).__appNavigate;
    };
  }, [navigate]);

  // Handle messages from service worker (e.g. notificationclick navigation)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleSwMsg = (event: MessageEvent) => {
        if (event.data?.type === 'NAVIGATE' && event.data?.url) {
          const target = normalizeAppRoute(event.data.url);
          const chatUid = extractChatUserIdFromTarget(target);
          const hasLiveProposal = target.includes('liveProposal=1');
          if (chatUid && hasLiveProposal) {
            useGlobalStore.getState().setPendingLiveProposal({
              senderId: chatUid,
              senderName: 'Friend',
              timestamp: Date.now()
            });
          }
          navigate(target);
          if (chatUid) {
            window.dispatchEvent(new CustomEvent('open_chat_direct', { detail: { userId: chatUid, liveProposal: hasLiveProposal } }));
          }
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMsg);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMsg);
      };
    }
  }, [navigate]);

  // Foreground FCM message listener
  useEffect(() => {
    let unsubForeground: any;
    listenForegroundMessages((payload) => {
      const senderId = payload.data?.sender_id;
      const msgType = payload.data?.type;
      if (msgType === 'message' && (!isMessageAlertsEnabled() || (senderId && isChatMuted(senderId)))) return;
      if (msgType === 'mention' && !isMentionAlertsEnabled()) return;

      const isLiveProposal = msgType === 'live_proposal' || payload.data?.action === 'LIVE_PROPOSAL_REQUEST';
      if (isLiveProposal && senderId) {
        useGlobalStore.getState().setPendingLiveProposal({
          senderId,
          senderName: payload.data?.sender_name || 'Friend',
          senderAvatar: payload.data?.sender_avatar,
          timestamp: Date.now()
        });
        window.dispatchEvent(new CustomEvent('P2P_SIGNAL', {
          detail: {
            peerId: senderId,
            data: {
              type: 'LIVE_PROPOSAL_REQUEST',
              sender_id: senderId,
              sender_name: payload.data?.sender_name,
              sender_avatar: payload.data?.sender_avatar
            }
          }
        }));
      }

      const defaultMsgUrl = senderId
        ? (isLiveProposal ? `/messages?user=${senderId}&liveProposal=1` : `/messages?user=${senderId}`)
        : '/';
      const targetUrl = normalizeAppRoute(
        payload.data?.url || (msgType === 'message' || isLiveProposal ? defaultMsgUrl : '/')
      );
      const title = payload.notification?.title || payload.data?.title || 'New Notification';
      const body = payload.notification?.body || payload.data?.body || 'You have a new message';

      const { isChatOpen, activeChatId } = useGlobalStore.getState();
      if ((msgType === 'message' || isLiveProposal) && isChatOpen && activeChatId === senderId) {
        playNotificationSound();
        return;
      }

      const dedupeKey = isLiveProposal && senderId
        ? `live_prop_${senderId}`
        : payload.data?.notif_id
        ? `msg_${payload.data.notif_id}`
        : (senderId ? `msg_fc_${senderId}_${body}` : undefined);

      showInAppNotificationToast({
        title,
        body,
        avatar: payload.data?.sender_avatar,
        url: targetUrl,
        type: msgType,
        senderId,
        dedupeKey
      });
    }).then(unsub => {
      unsubForeground = unsub;
    });

    return () => {
      if (typeof unsubForeground === 'function') {
        unsubForeground();
      }
    };
  }, []);

  // Instant In-App Realtime Notification Listener (Sub-100ms delivery)
  useEffect(() => {
    if (!currentUser?.id) return;
    let channel: any;
    import('@/lib/supabase').then(({ supabase }) => {
      channel = supabase.channel(`user_notifications_${currentUser.id}`)
        .on('broadcast', { event: 'IN_APP_NOTIFICATION' }, (event) => {
          const payload = event.payload;
          if (!payload) return;
          const { isChatOpen, activeChatId } = useGlobalStore.getState();
          const senderId = payload.data?.sender_id;
          const msgType = payload.data?.type;
          if (msgType === 'message' && (!isMessageAlertsEnabled() || (senderId && isChatMuted(senderId)))) return;
          if (msgType === 'mention' && !isMentionAlertsEnabled()) return;

          const isLiveProposal = msgType === 'live_proposal' || payload.data?.action === 'LIVE_PROPOSAL_REQUEST';
          if (isLiveProposal && senderId) {
            useGlobalStore.getState().setPendingLiveProposal({
              senderId,
              senderName: payload.data?.sender_name || 'Friend',
              senderAvatar: payload.data?.sender_avatar,
              timestamp: Date.now()
            });
            window.dispatchEvent(new CustomEvent('P2P_SIGNAL', {
              detail: {
                peerId: senderId,
                data: {
                  type: 'LIVE_PROPOSAL_REQUEST',
                  sender_id: senderId,
                  sender_name: payload.data?.sender_name,
                  sender_avatar: payload.data?.sender_avatar
                }
              }
            }));
          }

          if ((msgType === 'message' || isLiveProposal) && isChatOpen && activeChatId === senderId) {
            playNotificationSound();
            return;
          }
          const defaultUrl = senderId
            ? (isLiveProposal ? `/messages?user=${senderId}&liveProposal=1` : `/messages?user=${senderId}`)
            : '/';
          const targetUrl = normalizeAppRoute(payload.data?.url || defaultUrl);
          const dedupeKey = isLiveProposal && senderId
            ? `live_prop_${senderId}`
            : payload.data?.notif_id
            ? `msg_${payload.data.notif_id}`
            : (senderId ? `msg_bc_${senderId}_${payload.body || ''}` : undefined);

          showInAppNotificationToast({
            title: payload.title || 'New Notification',
            body: payload.body || 'You received a notification',
            avatar: payload.data?.sender_avatar,
            url: targetUrl,
            type: msgType,
            senderId,
            dedupeKey
          });
        })
        .on('broadcast', { event: 'LIVE_PROPOSAL_SIGNAL' }, (event) => {
          const payload = event.payload;
          if (!payload || !payload.sender_id) return;

          if (payload.type === 'LIVE_PROPOSAL_REQUEST') {
            useGlobalStore.getState().setPendingLiveProposal({
              senderId: payload.sender_id,
              senderName: payload.sender_name || 'Friend',
              senderAvatar: payload.sender_avatar,
              timestamp: Date.now()
            });
          } else if (
            payload.type === 'LIVE_PROPOSAL_CANCEL' ||
            payload.type === 'LIVE_PROPOSAL_REJECTED' ||
            payload.type === 'LIVE_PROPOSAL_ACCEPTED' ||
            payload.type === 'LIVE_STOP'
          ) {
            useGlobalStore.getState().clearPendingLiveProposal(payload.sender_id);
          }

          // Dispatch locally so Messages.tsx immediately catches the proposal / cancel / accept / reject
          window.dispatchEvent(new CustomEvent('P2P_SIGNAL', {
            detail: { peerId: payload.sender_id, data: payload }
          }));

          if (payload.type === 'LIVE_PROPOSAL_REQUEST') {
            const { isChatOpen, activeChatId } = useGlobalStore.getState();
            if (!isChatOpen || activeChatId !== payload.sender_id) {
              showInAppNotificationToast({
                title: '⚡ Live Typing Request',
                body: `${payload.sender_name || 'A friend'} wants to start Live Typing! Tap to accept.`,
                avatar: payload.sender_avatar,
                url: `/messages?user=${payload.sender_id}&liveProposal=1`,
                type: 'live_proposal',
                senderId: payload.sender_id,
                dedupeKey: `live_prop_${payload.sender_id}`
              });
            }
          }
        })
        .subscribe();
    });

    return () => {
      if (channel) {
        import('@/lib/supabase').then(({ supabase }) => {
          supabase.removeChannel(channel);
        });
      }
    };
  }, [currentUser?.id]);

  // Automatically reset isChatOpen if user navigates away from messages
  useEffect(() => {
    if (!isMessages && isChatOpen) {
      setIsChatOpen(false);
    }
  }, [isMessages, isChatOpen, setIsChatOpen]);

  // Hide bottom controls ONLY when inside messages AND an active conversation is open
  const shouldHideBottomNav = isMessages && isChatOpen;

  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<string | number>('100dvh');

  useEffect(() => {
    const initialHeight = window.innerHeight;
    
    const handleResize = () => {
      let keyboardOpen = false;
      
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
      
      // Check window shrink (Android)
      if (window.innerHeight < initialHeight * 0.8) {
        keyboardOpen = true;
      }
      
      // Check visual viewport (iOS)
      if (window.visualViewport) {
        const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.pageTop);
        if (offset > 50) {
          keyboardOpen = true;
        }
      }
      
      setIsKeyboardOpen(keyboardOpen);
    };
    
    handleResize();
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const queryClient = useQueryClient();
  const mainRef = useRef<HTMLElement>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullProgressRef = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && el.closest('nav, aside, a, button, input, textarea, select, [role="button"]')) {
      setTouchStart(null);
      return;
    }
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || isRefreshing || isCinema || isMeet) return;
    
    let target = e.target as HTMLElement | null;
    let hasScrolledParent = false;
    let inChatArea = false;
    
    while (target && target !== document.body) {
      if (target.id === 'chat-messages' || target.id === 'cinema-chat-container') {
        inChatArea = true;
      }
      if (target.scrollTop > 0) {
        hasScrolledParent = true;
      }
      target = target.parentElement;
    }

    if (inChatArea || hasScrolledParent) return;

    // For non-locked pages, also check mainEl
    const mainEl = mainRef.current;
    if (!isLockedViewportPage && (!mainEl || mainEl.scrollTop > 0)) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const distanceY = currentY - touchStart.y;
    const distanceX = Math.abs(currentX - touchStart.x);
    
    // Engage pull-to-refresh only on deliberate vertical downward drag (prevents jitter & per-frame re-renders during scroll)
    if (distanceY > 24 && distanceY > distanceX * 1.5) {
      const raw = Math.min((distanceY - 24) / 130, 1);
      const quantized = Math.round(raw * 10) / 10;
      if (quantized !== pullProgressRef.current) {
        pullProgressRef.current = quantized;
        setPullProgress(quantized);
      }
    } else if (pullProgressRef.current !== 0) {
      pullProgressRef.current = 0;
      setPullProgress(0);
    }
  };

  const onTouchEnd = async (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = Math.abs(touchStart.y - touchEnd.y);

    // Pull to refresh trigger
    if (pullProgressRef.current > 0.8 && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await queryClient.refetchQueries();
      } finally {
        setIsRefreshing(false);
        pullProgressRef.current = 0;
        setPullProgress(0);
      }
    } else if (pullProgressRef.current !== 0) {
      pullProgressRef.current = 0;
      setPullProgress(0);
    }

    // Swipe sensitivity thresholds - stricter to avoid accidental swipes when scrolling down
    const isHorizontalSwipe = Math.abs(distanceX) > 120 && distanceY < 40;
    
    if (isHorizontalSwipe) {
      handleSwipe(distanceX > 0 ? 'left' : 'right');
    }
    setTouchStart(null);
  };

  // The order of swipeable tabs
  const tabs = ['/', '/friends', '/reels', '/notifications', '/messages'];

  const handleSwipe = (direction: 'left' | 'right') => {
     // Ignore swipe navigation inside messages/cinema/meet to avoid conflicts with chat & room controls
     const currentPath = location.pathname;
     if (currentPath.startsWith('/messages') || currentPath.startsWith('/cinema') || currentPath.startsWith('/meet')) return;

     let currentIndex = tabs.findIndex(tab => currentPath === tab || (tab !== '/' && currentPath.startsWith(tab)));
     
     if (currentIndex === -1) {
       if (currentPath === '/') currentIndex = 0;
       else return;
     }

     if (direction === 'left' && currentIndex < tabs.length - 1) { // Swipe Left -> Next Tab
        navigate(tabs[currentIndex + 1]);
     } else if (direction === 'right' && currentIndex > 0) { // Swipe Right -> Prev Tab
        navigate(tabs[currentIndex - 1]);
     }
  };

  return (
    <div 
      className="app-viewport-shell w-full bg-[#f0f2f5] dark:bg-[#000000] flex flex-col transition-colors duration-300 overflow-hidden" 
      style={isKeyboardOpen && typeof viewportHeight === 'number' ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px`, bottom: 'auto', paddingBottom: '0px' } : { paddingBottom: '0px' }}
    >
      <div 
        className="app-inner-shell flex w-full flex-1 min-h-0 max-h-full max-w-[1920px] mx-auto overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {!isAuthPage && <Navbar />}
        {currentUser && <div className="hidden lg:block xl:min-w-[300px] shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto"><Sidebar /></div>}
        <main 
          ref={mainRef}
          className={`h-full max-h-full min-h-0 w-full flex-1 min-w-0 relative ${!isAuthPage ? 'pt-14' : ''} ${
            isLockedViewportPage
              ? `flex flex-col overflow-hidden ${isCinema || isMeet ? 'bg-black' : 'bg-white dark:bg-black'} ${!isKeyboardOpen ? (!shouldHideBottomNav ? 'pb-16 lg:pb-0' : 'md:pb-16 lg:pb-0') : ''}`
              : 'block overflow-x-hidden overflow-y-auto scroll-container px-0 md:p-4 pb-24 lg:pb-6'
          }`}
        >
          {/* Pull to Refresh Indicator */}
          {(pullProgress > 0 || isRefreshing) && (
            <div 
              className="absolute top-14 left-0 w-full flex justify-center z-50 pointer-events-none transition-transform"
              style={{ transform: `translateY(${Math.min(pullProgress * 50, 50)}px)` }}
            >
              <div className="bg-white dark:bg-gray-800 rounded-full shadow-md p-2 flex items-center justify-center">
                {isRefreshing ? (
                   <Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" />
                ) : (
                   <div 
                     className="w-6 h-6 border-2 border-[#1877F2] border-t-transparent rounded-full" 
                     style={{ transform: `rotate(${pullProgress * 360}deg)` }}
                   />
                )}
              </div>
            </div>
          )}

          <div className={isLockedViewportPage ? 'flex-1 w-full flex flex-col min-h-0 max-h-full overflow-hidden' : 'w-full'}>
          <Suspense fallback={
            <div className="h-full flex items-center justify-center min-h-[50vh]">
              <div className="fast-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1877F2]"></div>
            </div>
          }>
            <Routes>
              {/* Public & Guest-accessible Routes */}
              <Route path="/" element={<Feed />} />
              <Route path="/post/:id" element={<Feed />} />
              <Route path="/reels" element={<Reels />} />
              <Route path="/reels/:id" element={<Reels />} />
              <Route path="/lab" element={<Lab />} />
              <Route path="/features" element={<Features />} />
              <Route path="/about" element={<Features />} />
              <Route path="/child-safety" element={<ChildSafety />} />
              <Route
                path="/profile"
                element={
                  currentUser ? (
                    <Navigate to={`/profile/${currentUser.username || currentUser.id}`} replace />
                  ) : (
                    <GuestLockedView
                      title="Your Profile"
                      description="Sign in or create an account to view your profile, posts, and friends."
                    />
                  )
                }
              />
              <Route path="/profile/:username" element={<Profile />} />

              {/* Auth Pages */}
              <Route path="/login" element={!currentUser ? <Login /> : <AuthRouteRedirect />} />
              <Route path="/register" element={!currentUser ? <Register /> : <AuthRouteRedirect />} />

              {/* Protected Features with Guest Locked View */}
              <Route 
                path="/messages" 
                element={currentUser ? <Messages /> : <GuestLockedView title="Next Messenger" description="Sign in to chat in real-time, connect with friends, and receive push notifications." />} 
              />
              <Route 
                path="/messages/:id" 
                element={currentUser ? <Messages /> : <GuestLockedView title="Next Messenger" description="Sign in to chat in real-time, connect with friends, and receive push notifications." />} 
              />
              <Route 
                path="/friends" 
                element={currentUser ? <Friends /> : <GuestLockedView title="Friends Network" description="Sign in to connect with friends, follow creators, and discover people." />} 
              />
              <Route 
                path="/notifications" 
                element={currentUser ? <Notifications /> : <GuestLockedView title="Notifications" description="Sign in to view likes, comments, and interactions on your posts." />} 
              />
              <Route 
                path="/create-post" 
                element={currentUser ? <CreatePost /> : <GuestLockedView title="Create Post" description="Sign in to publish posts, upload reels, and share your ideas." />} 
              />
              <Route 
                path="/cinema" 
                element={currentUser ? <Cinema /> : <GuestLockedView title="Next Cinema" description="Sign in to watch movies and YouTube videos together with friends." />} 
              />
              <Route 
                path="/cinema/:id" 
                element={currentUser ? <Cinema /> : <GuestLockedView title="Next Cinema" description="Sign in to watch movies and YouTube videos together with friends." />} 
              />
              <Route 
                path="/meet" 
                element={currentUser ? <Meet /> : <GuestLockedView title="Next Meet" description="Sign in to start or join voice and video meeting rooms." />} 
              />
              <Route 
                path="/meet/:id" 
                element={currentUser ? <Meet /> : <GuestLockedView title="Next Meet" description="Sign in to start or join voice and video meeting rooms." />} 
              />
              <Route path="/settings" element={currentUser ? <Settings /> : <Navigate to="/login" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </div>
        </main>
      </div>
      {!isAuthPage && !isKeyboardOpen && (
        <div className={`fixed bottom-0 left-0 right-0 z-[100] lg:hidden ${shouldHideBottomNav ? 'hidden md:block' : ''}`}>
          <BottomNav />
        </div>
      )}
      <AuthBottomSheet />
    </div>
  );
};

const App: React.FC = () => {
  useWakeLock();

  useEffect(() => {
    // 1. STATIC BUILD VERSION TRACKING & SILENT STALE CACHE CLEANUP (already on fresh bundle, no extra reload needed)
    const isProd = Boolean((import.meta as any).env?.PROD);
    const currentVersion = (import.meta as any).env?.VITE_BUILD_TIME;
    if (isProd && typeof window !== 'undefined' && currentVersion) {
      const storedVersion = localStorage.getItem('app_build_version');
      if (storedVersion !== currentVersion) {
        localStorage.setItem('app_build_version', currentVersion);
        if ('caches' in window && (window as any).caches) {
          (window as any).caches.keys().then((names: string[]) => {
            names.forEach((name) => {
              if (name.includes('precache') || name.includes('workbox')) {
                (window as any).caches.delete(name).catch(() => {});
              }
            });
          }).catch(() => {});
        }
      }
    }
    if (isStandaloneMode()) {
      markPwaInstalled();
    }
  }, []);

  const reinstallLogoutPendingRef = useRef<boolean>(consumePendingReinstallLogout());

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (reinstallLogoutPendingRef.current) return null;
    return safeGetStoredUser();
  });
  const [loadingAuth, setLoadingAuth] = useState(() => {
    if (reinstallLogoutPendingRef.current) return false;
    if (safeGetStoredUser()) return false;
    // Never block guests with a loading screen on public/auth/locked routes; only hold briefly on /settings redirect
    const initialPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    return initialPath.startsWith('/settings');
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('next_media_theme') === 'dark';
  });

  const [desktopMode, setDesktopMode] = useState(() => {
    return localStorage.getItem('next_media_desktop') === 'true';
  });

  const [nextoEnabled, setNextoEnabled] = useState(() => {
    const saved = localStorage.getItem('next_media_nexto');
    return saved === null ? true : saved === 'true';
  });

  const [robotSize, setRobotSizeState] = useState(() => {
    const saved = localStorage.getItem('next_media_robot_size');
    return saved ? parseInt(saved, 10) : 80;
  });

  const setRobotSize = (size: number) => {
    setRobotSizeState(size);
    localStorage.setItem('next_media_robot_size', String(size));
  };

  const [bottomBarSize, setBottomBarSizeState] = useState<'small'|'medium'|'large'>(() => {
    return (localStorage.getItem('next_media_bottombarsize') as 'small'|'medium'|'large') || 'medium';
  });
  const setBottomBarSize = (size: 'small'|'medium'|'large') => {
    setBottomBarSizeState(size);
    localStorage.setItem('next_media_bottombarsize', size);
  };

  const [iconColor, setIconColorState] = useState(() => {
    return localStorage.getItem('next_media_iconcolor') || '#1877F2';
  });
  const setIconColor = (color: string) => {
    setIconColorState(color);
    localStorage.setItem('next_media_iconcolor', color);
  };

  const [autoplayVideos, setAutoplayVideosState] = useState(() => {
    const saved = localStorage.getItem('next_media_autoplay');
    return saved === null ? true : saved === 'true';
  });
  const setAutoplayVideos = (val: boolean) => {
    setAutoplayVideosState(val);
    localStorage.setItem('next_media_autoplay', String(val));
  };

  const [saveDataMode, setSaveDataModeState] = useState(() => {
    const saved = localStorage.getItem('next_media_savedata');
    return saved === 'true';
  });
  const setSaveDataMode = (val: boolean) => {
    setSaveDataModeState(val);
    localStorage.setItem('next_media_savedata', String(val));
  };

  const [highContrastMode, setHighContrastModeState] = useState(() => {
    const saved = localStorage.getItem('next_media_highcontrast');
    return saved === 'true';
  });
  const setHighContrastMode = (val: boolean) => {
    setHighContrastModeState(val);
    localStorage.setItem('next_media_highcontrast', String(val));
  };

  const [hapticFeedback, setHapticFeedbackState] = useState(() => {
    const saved = localStorage.getItem('next_media_haptic');
    return saved === null ? true : saved === 'true';
  });
  const setHapticFeedback = (val: boolean) => {
    setHapticFeedbackState(val);
    localStorage.setItem('next_media_haptic', String(val));
  };

  const [animationsEnabled, setAnimationsEnabledState] = useState(() => {
    const saved = localStorage.getItem('next_media_animations');
    return saved === null ? true : saved === 'true';
  });
  const setAnimationsEnabled = (val: boolean) => {
    setAnimationsEnabledState(val);
    localStorage.setItem('next_media_animations', String(val));
  };

  const [incognitoMode, setIncognitoModeState] = useState(() => {
    const saved = localStorage.getItem('next_media_incognito');
    return saved === 'true';
  });
  const setIncognitoMode = (val: boolean) => {
    setIncognitoModeState(val);
    localStorage.setItem('next_media_incognito', String(val));
  };

  const [soundEffects, setSoundEffectsState] = useState(() => {
    const saved = localStorage.getItem('next_media_sound');
    return saved === 'true';
  });
  const setSoundEffects = (val: boolean) => {
    setSoundEffectsState(val);
    localStorage.setItem('next_media_sound', String(val));
  };

  const [compactFeed, setCompactFeedState] = useState(() => {
    const saved = localStorage.getItem('next_media_compactfeed');
    return saved === 'true';
  });
  const setCompactFeed = (val: boolean) => {
    setCompactFeedState(val);
    localStorage.setItem('next_media_compactfeed', String(val));
  };

  const [showAllReels, setShowAllReelsState] = useState(() => {
    const saved = localStorage.getItem('next_media_showallreels');
    return saved === 'true'; // Default is false to show only uploaded
  });
  const setShowAllReels = (val: boolean) => {
    setShowAllReelsState(val);
    localStorage.setItem('next_media_showallreels', String(val));
  };

  const [autoLoginOnReinstall, setAutoLoginOnReinstallState] = useState<boolean>(() => {
    return isAutoLoginOnReinstallEnabled(); // Default is false (OFF)
  });
  const setAutoLoginOnReinstall = (val: boolean) => {
    setAutoLoginOnReinstallState(val);
    setAutoLoginOnReinstallEnabled(val);
  };

  const [textSize, setTextSizeState] = useState<'normal' | 'large' | 'extra-large'>(() => {
    const saved = localStorage.getItem('next_media_textsize');
    return (saved === 'large' || saved === 'extra-large') ? saved : 'normal';
  });
  const setTextSize = (size: 'normal' | 'large' | 'extra-large') => {
    setTextSizeState(size);
    localStorage.setItem('next_media_textsize', size);
  };

  const [messageAlerts, setMessageAlertsState] = useState<boolean>(() => {
    return localStorage.getItem('next_media_msg_alerts') !== 'false';
  });
  const setMessageAlerts = (val: boolean) => {
    setMessageAlertsState(val);
    localStorage.setItem('next_media_msg_alerts', String(val));
  };

  const [mentionAlerts, setMentionAlertsState] = useState<boolean>(() => {
    return localStorage.getItem('next_media_mention_alerts') !== 'false';
  });
  const setMentionAlerts = (val: boolean) => {
    setMentionAlertsState(val);
    localStorage.setItem('next_media_mention_alerts', String(val));
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('next_media_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('next_media_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.style.fontSize =
      textSize === 'extra-large' ? '19px' : textSize === 'large' ? '17.5px' : '16px';
  }, [textSize]);

  useEffect(() => {
    if (highContrastMode) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrastMode]);

  useEffect(() => {
    if (!animationsEnabled) {
      document.body.classList.add('no-animations');
    } else {
      document.body.classList.remove('no-animations');
    }
  }, [animationsEnabled]);



  useEffect(() => {
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    
    if (desktopMode) {
      viewportMeta.setAttribute('content', 'width=1024');
      localStorage.setItem('next_media_desktop', 'true');
    } else {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content');
      localStorage.setItem('next_media_desktop', 'false');
    }
  }, [desktopMode]);

  const toggleDarkMode = () => {
    const newVal = !darkMode;
    setDarkMode(newVal);
    localStorage.setItem('next_media_theme', newVal ? 'dark' : 'light');
    if (newVal) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleDesktopMode = () => {
    const newVal = !desktopMode;
    setDesktopMode(newVal);
    localStorage.setItem('next_media_desktop', String(newVal));
  };
  const toggleNexto = () => {
    const newVal = !nextoEnabled;
    setNextoEnabled(newVal);
    localStorage.setItem('next_media_nexto', String(newVal));
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
    
    // Clear React Query cache
    const qc = (window as any).queryClient;
    if (qc) {
      qc.clear();
    }

    // Clear IndexedDB completely to remove all cached query data
    try {
      const idb = await import('idb-keyval');
      await idb.clear();
    } catch (err) {
      console.error("Error clearing idb:", err);
    }

    // Preserve critical settings and saved accounts
    const savedAccounts = localStorage.getItem('next_saved_accounts');
    const theme = localStorage.getItem('next_media_theme');
    const desktop = localStorage.getItem('next_media_desktop');
    const nexto = localStorage.getItem('next_media_nexto');
    const keyboardHeight = localStorage.getItem('saved_keyboard_height');
    const autoLoginReinstall = localStorage.getItem(AUTO_LOGIN_REINSTALL_KEY);
    const pwaInstalled = localStorage.getItem('next_pwa_installed');
    const savedTextSize = localStorage.getItem('next_media_textsize');
    const savedMsgAlerts = localStorage.getItem('next_media_msg_alerts');
    const savedMentionAlerts = localStorage.getItem('next_media_mention_alerts');

    // Clear local storage and session storage
    localStorage.clear();
    sessionStorage.clear();

    // Restore preserved values
    if (savedAccounts) localStorage.setItem('next_saved_accounts', savedAccounts);
    if (theme) localStorage.setItem('next_media_theme', theme);
    if (desktop) localStorage.setItem('next_media_desktop', desktop);
    if (nexto) localStorage.setItem('next_media_nexto', nexto);
    if (keyboardHeight) localStorage.setItem('saved_keyboard_height', keyboardHeight);
    if (autoLoginReinstall !== null) localStorage.setItem(AUTO_LOGIN_REINSTALL_KEY, autoLoginReinstall);
    if (pwaInstalled !== null) localStorage.setItem('next_pwa_installed', pwaInstalled);
    if (savedTextSize) localStorage.setItem('next_media_textsize', savedTextSize);
    if (savedMsgAlerts !== null) localStorage.setItem('next_media_msg_alerts', savedMsgAlerts);
    if (savedMentionAlerts !== null) localStorage.setItem('next_media_mention_alerts', savedMentionAlerts);

    setCurrentUser(null);
    window.location.href = '/login';
  };

  useEffect(() => {
    if (currentUser?.id) {
      const { password: _removedPwd, ...cleanCurrentUser } = currentUser as any;
      localStorage.setItem('next_media_user', JSON.stringify(cleanCurrentUser));
      useGlobalStore.getState().setCurrentUser(cleanCurrentUser);
      flushPendingFCMToken(currentUser.id).catch(() => {});

      // Ensure native Android WebView push permission or Web Notification permission
      if ((window as any).AndroidApp && typeof (window as any).AndroidApp.requestPushPermission === 'function') {
        requestNotificationPermission();
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
           setTimeout(() => {
             toast('Enable Push Notifications', {
                description: 'Get real-time alerts for new messages.',
                action: {
                  label: 'Allow',
                  onClick: async () => {
                    await requestNotificationPermission();
                  }
                },
                duration: Infinity,
                id: 'notif-prompt'
             });
           }, 2000);
        } else if (Notification.permission === 'granted') {
           requestNotificationPermission(); // Gets FCM token silently
        }
      }

      // One-time background sync of current user & public legacy profiles to Supabase (deferred so startup stays 100% responsive)
      const syncKey = `supa_self_synced_${currentUser.id}`;
      let backfillTimer: any;
      if (!sessionStorage.getItem(syncKey)) {
        sessionStorage.setItem(syncKey, '1');
        backfillTimer = setTimeout(() => {
          syncProfileToSupabase(currentUser).catch(() => {});
          backfillPublicProfilesOnce().catch(() => {});
        }, 3500);
      }

      // Initialize global listeners via Zustand Store after UI mounts and Dexie hydrates
      let cancelled = false;
      let unsubMessages: any;
      let unsubNotifs: any;
      
      localDB.open().then(() => {
        if (cancelled) return;
        unsubMessages = useGlobalStore.getState().initMessageListener(currentUser.id);
        unsubNotifs = useGlobalStore.getState().initNotificationListener(currentUser.id);
      }).catch(console.warn);

      return () => {
        cancelled = true;
        if (backfillTimer) clearTimeout(backfillTimer);
        if (unsubMessages) unsubMessages();
        if (unsubNotifs) unsubNotifs();
      };
    }
  }, [currentUser?.id]);

  useEffect(() => {
    let unmounted = false;
    (window as any).__NEXT_APP_MOUNTED = true;

    // Hard failsafe: never keep the router blocked on Loading Next... for more than 1.5s on slow BD carriers
    const authUnlockTimer = setTimeout(() => {
      if (!unmounted) {
        setLoadingAuth(false);
      }
    }, 1500);

    const handleRedirectResult = async () => {
      try {
        const result = await withTimeout(getRedirectResult(auth), 4000, null as any);
        if (result && result.user) {
          const userDoc = await withTimeout(getDoc(doc(db, 'profiles', result.user.uid)), 3500, null as any);
          if (!userDoc || !userDoc.exists()) {
            const emailBase = result.user.email?.split('@')[0] || result.user.uid.substring(0, 8);
            const uniqueUsername = await withTimeout(ensureUniqueUsername(emailBase, result.user.uid), 2500, emailBase);
            const bio = await withTimeout(generateBio(uniqueUsername), 2500, 'Exploring Next.');
            const newProfile = {
               username: uniqueUsername,
               display_name: result.user.displayName || uniqueUsername,
               email: result.user.email,
               bio: bio,
               avatar_url: result.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uniqueUsername}`,
               created_at: new Date().toISOString()
            };
            try {
              await withTimeout(setDoc(doc(db, 'profiles', result.user.uid), newProfile), 3000, undefined as any);
            } catch (_) {}
            const fullProfile = { id: result.user.uid, ...newProfile };
            syncProfileToSupabase(fullProfile).catch(() => {});
            cacheUserInDexie(fullProfile).catch(() => {});
            if (!unmounted) setCurrentUser(fullProfile as any);
          } else {
            const existingProfile = { id: userDoc.id, ...userDoc.data() };
            syncProfileToSupabase(existingProfile).catch(() => {});
            cacheUserInDexie(existingProfile).catch(() => {});
            if (!unmounted) setCurrentUser(existingProfile as any);
          }
        }
      } catch (err) {
        console.error("Redirect auth error:", err);
      }
    };
    
    handleRedirectResult();

    const handleReinstallForceLogout = () => {
      reinstallLogoutPendingRef.current = false;
      setCurrentUser(null);
      setLoadingAuth(false);
    };
    window.addEventListener('next_force_logout_reinstall', handleReinstallForceLogout);

    if (reinstallLogoutPendingRef.current && !isAutoLoginOnReinstallEnabled()) {
      enforceFreshLoginAfterReinstall().catch(() => {});
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (reinstallLogoutPendingRef.current && !isAutoLoginOnReinstallEnabled()) {
         reinstallLogoutPendingRef.current = false;
         await enforceFreshLoginAfterReinstall();
         if (!unmounted) {
           setCurrentUser(null);
           setLoadingAuth(false);
         }
         return;
      }

      if (user) {
         fetchUserProfile(user.uid);
      } else {
         const savedUser = safeGetStoredUser();
         if (savedUser) {
           setCurrentUser(savedUser);
         } else {
           setCurrentUser(null);
         }
         setLoadingAuth(false);
      }
    });

    return () => {
      unmounted = true;
      clearTimeout(authUnlockTimer);
      window.removeEventListener('next_force_logout_reinstall', handleReinstallForceLogout);
      unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      // 1. Strict Local-Lock Rule: Check Dexie first (with 1.5s safety timeout)
      const localUser = await withTimeout(localDB.users.get(userId), 1500, undefined);
      if (localUser) {
        console.log("Local-Lock: Loaded user from Dexie, blocking Firebase request.");
        setCurrentUser(localUser as any);
        setLoadingAuth(false);
        const syncKey = `supa_self_synced_${userId}`;
        if (!sessionStorage.getItem(syncKey)) {
          sessionStorage.setItem(syncKey, '1');
          syncProfileToSupabase(localUser).catch(() => {});
        }
        return;
      }

      // Immediately prefer Supabase smart fetch (backed by resilient proxy fallback!) first if Firestore stalls
      let data: any = await withTimeout(fetchProfileSmart(userId), 4500, null);

      if (!data) {
        for (let attempts = 0; attempts < 2; attempts++) {
          try {
            const userDoc = await withTimeout(getDoc(doc(db, 'profiles', userId)), 3000, null as any);
            if (userDoc && userDoc.exists()) {
              data = { id: userDoc.id, ...userDoc.data() };
              break;
            }
          } catch (dbErr) {
            console.warn("Firestore error during profile fetch:", dbErr);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
        
      if (data) {
        syncProfileToSupabase(data).catch(() => {});

        const { password: _removedPwd, ...cachedCopy } = { ...data };
        if (cachedCopy.avatar_url) {
           cachedCopy.avatar_url = await withTimeout(getBase64Image(cachedCopy.avatar_url), 2500, cachedCopy.avatar_url);
        }
        
        cacheUserInDexie(cachedCopy).catch(() => {});

        setCurrentUser(cachedCopy as User);
        localStorage.setItem('next_media_user', JSON.stringify(cachedCopy));
      } else {
        console.warn("Profile not found or DB unreachable. Falling back to local/auth data.");
        const parsedSaved = safeGetStoredUser();
        if (parsedSaved && parsedSaved.id === userId) {
          syncProfileToSupabase(parsedSaved).catch(() => {});
          setCurrentUser(parsedSaved);
          return;
        }
        // If no local storage matches, create user from Firebase Auth and sync to Supabase
        if (auth.currentUser) {
          const emailBase = auth.currentUser.email?.split('@')[0] || userId.substring(0, 8);
          const uniqueUsername = await ensureUniqueUsername(emailBase, userId);
          const authFallback = {
            id: userId,
            username: uniqueUsername,
            email: auth.currentUser.email,
            display_name: auth.currentUser.displayName || uniqueUsername,
            avatar_url: auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uniqueUsername}`,
            created_at: new Date().toISOString()
          };
          syncProfileToSupabase(authFallback).catch(() => {});
          cacheUserInDexie(authFallback).catch(() => {});
          setCurrentUser(authFallback as User);
        }
      }
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
      const savedUser = safeGetStoredUser();
      if (savedUser) setCurrentUser(savedUser);
    } finally {
      setLoadingAuth(false);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="fast-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-800 border-t-[#1877F2]" />
            <img
              src="/Next-AppLogo.jpg"
              alt="Next"
              className="absolute w-11 h-11 rounded-full object-cover shadow-sm"
            />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-bold animate-pulse">Loading Next...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, logout }}>
      <ThemeContext.Provider value={{ 
        darkMode, toggleDarkMode, 
        desktopMode, toggleDesktopMode, 
        nextoEnabled, toggleNexto,
        robotSize, setRobotSize,
        bottomBarSize, setBottomBarSize,
        iconColor, setIconColor,
        autoplayVideos, setAutoplayVideos,
        saveDataMode, setSaveDataMode,
        highContrastMode, setHighContrastMode,
        hapticFeedback, setHapticFeedback,
        animationsEnabled, setAnimationsEnabled,
        incognitoMode, setIncognitoMode,
        soundEffects, setSoundEffects,
        compactFeed, setCompactFeed,
        showAllReels, setShowAllReels,
        autoLoginOnReinstall, setAutoLoginOnReinstall,
        textSize, setTextSize,
        messageAlerts, setMessageAlerts,
        mentionAlerts, setMentionAlerts
      }}>
        <BrowserRouter>
          <DeepLinkRouterGuard>
            <AppLayout />
            {nextoEnabled && <NextoRobot />}
            <OTAUpdateBanner />
          </DeepLinkRouterGuard>
        </BrowserRouter>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
};

export default App;

