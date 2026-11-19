/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Automatically clean up outdated precaches from prior versions
cleanupOutdatedCaches();

// Precache static assets built by Vite
precacheAndRoute((self as any).__WB_MANIFEST || []);

// We don't skip waiting here automatically, but it's okay for PWA plugin's autoUpdate to manage it

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING')
    self.skipWaiting();
});

declare const importScripts: (...urls: string[]) => void;

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "next-489515",
  appId: "1:947258146571:web:2dd66aa09474e5f7d22c0e",
  apiKey: "AIzaSyAiczfp6lTr57-VrZyJXZKWbHKx32kBBtg",
  authDomain: "next-489515.firebaseapp.com",
  storageBucket: "next-489515.firebasestorage.app",
  messagingSenderId: "947258146571"
};

try {
  (self as any).firebase.initializeApp(firebaseConfig);
  const messaging = (self as any).firebase.messaging();

  messaging.onBackgroundMessage((payload: any) => {
    console.log('[sw.ts] Received background message ', payload);
    
    // Module 2: Silent FCM Push Purge
    if (payload.data && payload.data.action === 'DELETE_POST' && payload.data.postId) {
      console.log('[sw.ts] Silent push purge for post:', payload.data.postId);
      const targetId = payload.data.postId;
      try {
        const req = indexedDB.open('NextAppDB');
        req.onsuccess = () => {
          const idb = req.result;
          try {
            const storesToClean = ['feed_videos', 'posts'].filter((name) => idb.objectStoreNames.contains(name));
            if (storesToClean.length > 0) {
              const tx = idb.transaction(storesToClean, 'readwrite');
              storesToClean.forEach((storeName) => {
                tx.objectStore(storeName).delete(targetId);
              });
            }
          } catch (txErr) {
            console.warn('[sw.ts] IndexedDB purge error:', txErr);
          } finally {
            idb.close();
          }
        };
      } catch (err) {
        console.warn('[sw.ts] IndexedDB open failed:', err);
      }
      
      // Do not show a notification for silent background sync
      return;
    }

    const notificationTitle = payload.notification?.title || payload.data?.title || 'New Message';
    const safeIcon = (payload.data?.sender_avatar && String(payload.data.sender_avatar).startsWith('https://'))
      ? payload.data.sender_avatar
      : '/favicon.ico';
    const notificationOptions: NotificationOptions & { renotify?: boolean } = {
      body: payload.notification?.body || payload.data?.body || 'You have a new notification',
      icon: safeIcon,
      badge: '/favicon.ico',
      tag: payload.data?.chat_id || payload.data?.sender_id || 'next_notification',
      renotify: true,
      data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch(e) {
  console.log('Firebase messaging not initialized in sw.ts');
}

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  
  let urlToOpen = '/';
  const data = event.notification.data;
  
  if (data) {
    if (data.type === 'message' && data.sender_id) {
      urlToOpen = `/messages?user=${encodeURIComponent(data.sender_id)}`;
    } else if (data.url) {
      urlToOpen = data.url;
    } else if (data.post_id) {
      urlToOpen = `/post/${data.post_id}`;
    } else if (data.type === 'friend_request' || data.type === 'friend_accept') {
      urlToOpen = '/friends';
    }
  }

  // Convert full same-origin HTTPS URL to relative route if needed
  try {
    if (typeof urlToOpen === 'string' && urlToOpen.startsWith('http')) {
      const parsed = new URL(urlToOpen);
      if (parsed.origin === self.location.origin) {
        urlToOpen = parsed.pathname + parsed.search + parsed.hash;
      }
    }
  } catch (_) {}

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients: any) => {
      // If a window is already open, focus it and soft-navigate via postMessage (avoids destroying SPA state)
      if (windowClients && windowClients.length > 0) {
        const client = windowClients[0];
        try {
          client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
        } catch (e) {}
        if ('focus' in client) {
          return client.focus();
        }
        return client;
      }
      // If no open tab, launch a new window with the deep link target
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
