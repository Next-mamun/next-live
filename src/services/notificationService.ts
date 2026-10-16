import React from 'react';
import { toast } from 'sonner';
import { messaging, db, auth } from '@/lib/firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export const updateFCMTokenInDb = async (token: string) => {
  if (token && auth.currentUser) {
    try {
      await updateDoc(doc(db, 'profiles', auth.currentUser.uid), {
        fcm_token: token,
        updated_at: new Date().toISOString()
      });
      console.log('FCM Token saved to profile:', token.substring(0, 10) + '...');
    } catch (err) {
      console.error('Failed to update FCM token in DB:', err);
    }
  }
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
    (window as any).AndroidApp.requestPushPermission();
    return true; // Token will arrive asynchronously via setAndroidFCMToken
  }

  if (!("Notification" in window)) {
    console.log("This browser does not support desktop notification");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const msg = await messaging();
        if (msg) {
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BF1N2MaGEU8mze53cT65jsQZmwTj7-qbNhsqPGuc3cswdZMKu6eYi8Q9gOXNggerRSSvolQhalQIiIiNGNzC8FQ';
          const token = await getToken(msg, {
            vapidKey: vapidKey,
            serviceWorkerRegistration: registration
          });
          await updateFCMTokenInDb(token);
        }
      } catch (tokenErr) {
        console.error('Failed to get FCM token:', tokenErr);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error requesting notification permission or getting token:", error);
    return false;
  }
};

export const sendPushNotification = async (token: string, title: string, body: string, data?: any, receiverId?: string) => {
  try {
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, title, body, data, userId: receiverId }),
    });
    const result = await response.json();
    
    if (result?.notRegistered && receiverId) {
      tokenCache.delete(receiverId);
      try {
        await updateDoc(doc(db, 'profiles', receiverId), { fcm_token: null });
      } catch (e) {}
    }
    
    return result;
  } catch (error) {
    console.warn('Notification API call warning:', error);
    return { error: 'Failed to send notification' };
  }
};

const tokenCache = new Map<string, { token: string, expiry: number }>();
let notificationQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

const processQueue = async () => {
  if (isProcessingQueue || notificationQueue.length === 0) return;
  isProcessingQueue = true;
  
  while (notificationQueue.length > 0) {
    const task = notificationQueue.shift();
    if (task) {
      await task();
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit buffer
    }
  }
  
  isProcessingQueue = false;
};

export const triggerNotification = async (receiverId: string, title: string, body: string, data?: any) => {
  const task = async () => {
    try {
      let token = '';
      const cached = tokenCache.get(receiverId);
      if (cached && Date.now() < cached.expiry) {
        token = cached.token;
      } else {
        const userDoc = await getDoc(doc(db, 'profiles', receiverId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.fcm_token) {
            token = userData.fcm_token;
            // Cache token for 1 hour to reduce DB reads when chatting
            tokenCache.set(receiverId, { token, expiry: Date.now() + 60 * 60 * 1000 });
          }
        }
      }

      if (token) {
        await sendPushNotification(token, title, body, data, receiverId);
      }
    } catch (err) {
      console.warn('Failed to trigger notification:', err);
    }
  };

  notificationQueue.push(task);
  processQueue();
  
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
  senderId
}: {
  title: string;
  body: string;
  avatar?: string;
  url: string;
  type?: string;
  senderId?: string;
}) => {
  // Play sound and vibration
  playNotificationSound();

  toast.custom(
    (t) =>
      React.createElement(
        'div',
        {
          onClick: () => {
            toast.dismiss(t);
            if ((window as any).__appNavigate) {
              (window as any).__appNavigate(url);
            } else {
              window.location.href = url;
            }
          },
          className:
            'flex items-center gap-3 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 p-3.5 rounded-2xl shadow-xl hover:shadow-2xl cursor-pointer w-full max-w-sm transition-all transform active:scale-95 select-none pointer-events-auto'
        },
        React.createElement(
          'div',
          { className: 'relative shrink-0' },
          avatar
            ? React.createElement('img', {
                src: avatar,
                alt: '',
                className: 'w-10 h-10 rounded-full object-cover border border-gray-100 dark:border-gray-700'
              })
            : React.createElement(
                'div',
                {
                  className:
                    'w-10 h-10 rounded-full bg-[#1877F2] text-white font-bold flex items-center justify-center text-sm shadow-sm'
                },
                title.charAt(0).toUpperCase()
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
        const targetUrl = (options?.data as any)?.url || '/messages';
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
