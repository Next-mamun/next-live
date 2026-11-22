import React from 'react';
import { toast } from 'sonner';
import { messaging, db, auth } from '@/lib/firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { normalizeAppRoute } from '@/lib/utils';

const PENDING_FCM_TOKEN_KEY = 'pending_android_fcm_token';
const MSG_ALERTS_KEY = 'next_media_msg_alerts';
const MENTION_ALERTS_KEY = 'next_media_mention_alerts';
const shownNotifKeys = new Map<string, number>();

export const isMessageAlertsEnabled = (): boolean => {
  try {
    return localStorage.getItem(MSG_ALERTS_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const isMentionAlertsEnabled = (): boolean => {
  try {
    return localStorage.getItem(MENTION_ALERTS_KEY) !== 'false';
  } catch {
    return true;
  }
};

const getActiveUserIdFallback = (): string | null => {
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  try {
    const saved = localStorage.getItem('next_media_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.id) return String(parsed.id);
    }
  } catch (_) {}
  return null;
};

export const shouldShowNotificationOnce = (dedupeKey?: string | null): boolean => {
  if (!dedupeKey) return true;
  const now = Date.now();
  const prev = shownNotifKeys.get(dedupeKey);
  if (prev && now - prev < 30_000) {
    return false;
  }
  shownNotifKeys.set(dedupeKey, now);
  if (shownNotifKeys.size > 200) {
    const cutoff = now - 30_000;
    for (const [k, ts] of shownNotifKeys.entries()) {
      if (ts < cutoff) shownNotifKeys.delete(k);
    }
  }
  return true;
};

export const updateFCMTokenInDb = async (token: string, explicitUserId?: string) => {
  if (!token || typeof token !== 'string') return;
  const uid = explicitUserId || getActiveUserIdFallback();
  if (!uid) {
    try {
      localStorage.setItem(PENDING_FCM_TOKEN_KEY, token);
    } catch (_) {}
    return;
  }

  try {
    localStorage.removeItem(PENDING_FCM_TOKEN_KEY);
  } catch (_) {}

  if (auth.currentUser?.uid === uid) {
    try {
      await setDoc(doc(db, 'profiles', uid), {
        fcm_token: token,
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to update FCM token in Firestore:', err);
    }
  }

  try {
    const { syncProfileToSupabase } = await import('@/lib/profileSync');
    await syncProfileToSupabase({ id: uid, fcm_token: token });
  } catch (_) {}
};

export const flushPendingFCMToken = async (userId?: string) => {
  try {
    const pending = localStorage.getItem(PENDING_FCM_TOKEN_KEY);
    if (pending) {
      await updateFCMTokenInDb(pending, userId);
    }
  } catch (_) {}
};

// Global callback for Android native code to pass the token back
(window as any).setAndroidFCMToken = (token: string) => {
  console.log('Received native FCM token from Android WebView');
  updateFCMTokenInDb(token);
};

export const requestNotificationPermission = async () => {
  // Check if running inside our specific Android WebView with a JavascriptInterface named "AndroidApp"
  if ((window as any).AndroidApp && typeof (window as any).AndroidApp.requestPushPermission === 'function') {
    console.log('Running in Android WebView. Requesting native push permission...');
    try {
      (window as any).AndroidApp.requestPushPermission();
    } catch (_) {}
    await flushPendingFCMToken();
    return true; // Token will arrive asynchronously via setAndroidFCMToken
  }

  if (typeof window === 'undefined' || !("Notification" in window)) {
    return false;
  }

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        let registration: ServiceWorkerRegistration | undefined;
        if ('serviceWorker' in navigator) {
          registration = await navigator.serviceWorker.getRegistration('/');
          if (!registration) {
            registration = await navigator.serviceWorker.register('/sw.js');
          }
          // Wait for SW activation cleanly before calling getToken
          if (!registration.active) {
            await Promise.race([
              navigator.serviceWorker.ready.then((r) => { registration = r; }),
              new Promise((resolve) => setTimeout(resolve, 4000))
            ]);
          }
        }
        const msg = await messaging();
        if (msg && registration) {
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BF1N2MaGEU8mze53cT65jsQZmwTj7-qbNhsqPGuc3cswdZMKu6eYi8Q9gOXNggerRSSvolQhalQIiIiNGNzC8FQ';
          const token = await getToken(msg, {
            vapidKey,
            serviceWorkerRegistration: registration
          });
          if (token) {
            await updateFCMTokenInDb(token);
          }
        }
      } catch (tokenErr) {
        console.warn('FCM token fetch warning:', tokenErr);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Error requesting notification permission or getting token:", error);
    return false;
  }
};

const sanitizePushData = (data?: any): Record<string, string> => {
  const clean: Record<string, string> = {};
  if (!data || typeof data !== 'object') return clean;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const str = typeof v === 'string' ? v : String(v);
    if (k === 'sender_avatar' && (str.startsWith('data:') || str.length > 512)) {
      continue;
    }
    clean[k] = str.slice(0, 1000);
  }
  return clean;
};

export const sendPushNotification = async (token: string, title: string, body: string, data?: any, receiverId?: string) => {
  try {
    const { getAuthHeaders } = await import('@/lib/clientAuth');
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token, title, body, data: sanitizePushData(data), userId: receiverId }),
    });
    const result = await response.json();
    
    if (result?.notRegistered && receiverId) {
      tokenCache.delete(receiverId);
    }
    
    return result;
  } catch (error) {
    console.warn('Notification API call warning:', error);
    return { error: 'Failed to send notification' };
  }
};

const tokenCache = new Map<string, { token: string, expiry: number }>();

export const triggerNotification = async (receiverId: string, title: string, body: string, data?: any) => {
  if (!receiverId) return null;

  // 1. Instant Real-Time In-App Delivery via Supabase REST Broadcast (httpSend avoids unsubscribed channel failures)
  try {
    const { supabase } = await import('@/lib/supabase');
    const channel: any = supabase.channel(`user_notifications_${receiverId}`);
    const broadcastPayload = {
      title,
      body,
      data,
      timestamp: Date.now()
    };
    if (typeof channel.httpSend === 'function') {
      channel.httpSend('IN_APP_NOTIFICATION', broadcastPayload).catch(() => {});
    } else {
      channel.send({
        type: 'broadcast',
        event: 'IN_APP_NOTIFICATION',
        payload: broadcastPayload
      }).catch(() => {});
    }
  } catch (e) {}

  // 2. High-Priority FCM Push Notification
  (async () => {
    try {
      let token = '';
      const cached = tokenCache.get(receiverId);
      if (cached && Date.now() < cached.expiry) {
        token = cached.token;
      } else {
        let supaToken = '';
        let fbToken = '';
        try {
          const { supabase } = await import('@/lib/supabase');
          const { data: supaProf } = await supabase
            .from('profiles')
            .select('fcm_token')
            .eq('id', receiverId)
            .maybeSingle();
          if (supaProf?.fcm_token) {
            supaToken = supaProf.fcm_token;
          }
        } catch (e) {}

        token = supaToken;

        if (!token) {
          const userDoc = await getDoc(doc(db, 'profiles', receiverId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.fcm_token) {
              fbToken = userData.fcm_token;
              token = fbToken;
              try {
                const { syncProfileToSupabase } = await import('@/lib/profileSync');
                syncProfileToSupabase({ id: receiverId, ...userData, fcm_token: token }).catch(() => {});
              } catch (e) {}
            }
          }
        }

        if (token) {
          tokenCache.set(receiverId, { token, expiry: Date.now() + 10 * 60 * 1000 });
        }
      }

      if (token) {
        const res = await sendPushNotification(token, title, body, data, receiverId);
        // If Supabase token was stale, fallback-check Firestore once for a fresher token
        if (res?.notRegistered) {
          try {
            const userDoc = await getDoc(doc(db, 'profiles', receiverId));
            const fbToken = userDoc.exists() ? userDoc.data()?.fcm_token : '';
            if (fbToken && fbToken !== token) {
              tokenCache.set(receiverId, { token: fbToken, expiry: Date.now() + 10 * 60 * 1000 });
              await sendPushNotification(fbToken, title, body, data, receiverId);
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('Failed to trigger FCM notification:', err);
    }
  })();

  return null;
};

export const playNotificationSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    }
  } catch (e) {
    // AudioContext failure fallback
  }

  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([100, 50, 100]);
    } catch (e) {}
  }
};

export const showInAppNotificationToast = ({
  title,
  body,
  avatar,
  url,
  type,
  senderId,
  dedupeKey
}: {
  title: string;
  body: string;
  avatar?: string;
  url: string;
  type?: string;
  senderId?: string;
  dedupeKey?: string;
}) => {
  if (dedupeKey && !shouldShowNotificationOnce(dedupeKey)) {
    return;
  }

  // Play sound and vibration
  playNotificationSound();

  toast.custom(
    (t) =>
      React.createElement(
        'div',
        {
          onClick: () => {
            toast.dismiss(t);
            const rawTarget = url || (senderId ? `/messages?user=${senderId}` : '/messages');
            const targetUrl = normalizeAppRoute(rawTarget);
            const hasLiveProposal = type === 'live_proposal' || targetUrl.includes('liveProposal=1');
            if (senderId) {
              window.dispatchEvent(new CustomEvent('open_chat_direct', { detail: { userId: senderId, liveProposal: hasLiveProposal } }));
            }
            if ((window as any).__appNavigate) {
              (window as any).__appNavigate(targetUrl);
            } else {
              window.location.href = targetUrl;
            }
          },
          className:
            'flex items-center gap-3 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 p-3.5 rounded-2xl shadow-xl hover:shadow-2xl cursor-pointer w-full max-w-sm transition-all transform active:scale-95 select-none pointer-events-auto'
        },
        React.createElement(
          'div',
          { className: 'relative shrink-0' },
          avatar && !avatar.includes('dicebear')
            ? React.createElement('img', {
                src: avatar,
                alt: '',
                className: 'w-10 h-10 rounded-full object-cover border border-gray-100 dark:border-gray-700'
              })
            : React.createElement(
                'div',
                {
                  className:
                    'w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm'
                },
                title.charAt(0).toUpperCase() || 'U'
              ),
          React.createElement('div', {
            className:
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-[#1A1A1A]'
          })
        ),
        React.createElement(
          'div',
          { className: 'flex-1 min-w-0 text-left' },
          React.createElement(
            'p',
            {
              className: 'text-sm font-bold text-gray-900 dark:text-gray-100 truncate leading-tight'
            },
            title
          ),
          React.createElement(
            'p',
            {
              className: 'text-xs text-gray-600 dark:text-gray-400 truncate mt-1'
            },
            body
          )
        ),
        React.createElement(
          'div',
          { className: 'shrink-0 flex items-center' },
          React.createElement(
            'span',
            {
              className:
                'text-xs font-semibold text-[#1877F2] bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg'
            },
            'Open'
          )
        )
      ),
    {
      duration: 5000,
      position: 'top-center'
    }
  );
};

export const showNotification = (title: string, options?: NotificationOptions) => {
  if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "granted") {
    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        notification.close();
        const dataObj = options?.data as any;
        const targetUrl = normalizeAppRoute(
          dataObj?.url || (dataObj?.sender_id ? `/messages?user=${dataObj.sender_id}` : '/messages')
        );
        const hasLiveProposal = dataObj?.type === 'live_proposal' || targetUrl.includes('liveProposal=1');
        if (dataObj?.sender_id) {
          window.dispatchEvent(new CustomEvent('open_chat_direct', { detail: { userId: dataObj.sender_id, liveProposal: hasLiveProposal } }));
        }
        if ((window as any).__appNavigate) {
          (window as any).__appNavigate(targetUrl);
        } else {
          window.location.href = targetUrl;
        }
      };
    } catch (e) {
      console.warn("Desktop notification display warning:", e);
    }
  }
};

export const listenForegroundMessages = async (onMessageReceived: (payload: any) => void) => {
  try {
    const msg = await messaging();
    if (msg) {
      const { onMessage } = await import('firebase/messaging');
      return onMessage(msg, (payload) => {
        console.log('[Foreground FCM Message]', payload);
        onMessageReceived(payload);
      });
    }
  } catch (e) {
    console.warn("Foreground FCM message setup error:", e);
  }
  return () => {};
};
