/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

const SW_VERSION = (import.meta as any).env?.VITE_BUILD_TIME || 'v2';
const HTML_SHELL_CACHE = 'next-html-shell-v2';
const ASSETS_CACHE = 'next-assets-v2';
const SW_META_CACHE = 'next-sw-meta';

self.skipWaiting();
clientsClaim();

// Clean up any outdated Workbox precaches from prior versions
cleanupOutdatedCaches();

// Precache lightweight PWA assets (icons & manifest)
precacheAndRoute((self as any).__WB_MANIFEST || []);

// Seed offline HTML shell on install so offline/slow deep-link launches always boot cleanly
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(HTML_SHELL_CACHE).then((cache) =>
      fetch('/', { cache: 'no-store' })
        .then(async (resp) => {
          if (resp && resp.ok) {
            await cache.put('/', resp.clone());
            await cache.put('/index.html', resp);
          }
        })
        .catch(() => {})
    )
  );
});

// Purge stale caches from legacy versions without touching active Workbox precache or forcing reloads
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const metaCache = await caches.open(SW_META_CACHE);
      const prevVerResp = await metaCache.match('/__sw_version');
      const prevVer = prevVerResp ? await prevVerResp.text() : null;

      const allKeys = await caches.keys();
      await Promise.all(
        allKeys.map((key) => {
          if (
            key !== HTML_SHELL_CACHE &&
            key !== ASSETS_CACHE &&
            key !== SW_META_CACHE &&
            !key.startsWith('workbox-')
          ) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );

      await metaCache.put('/__sw_version', new Response(SW_VERSION));
      await self.clients.claim();

      if (prevVer && prevVer !== SW_VERSION) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          try {
            client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
          } catch (_) {}
        }
      }
    } catch (_) {}
  })());
});

// Never cache version.json or API routes in the service worker
registerRoute(
  ({ url }) => url.pathname === '/version.json' || url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

// Always use NetworkFirst for page navigations so Web/PWA users get latest index.html,
// while falling back cleanly to the cached SPA shell on slow carriers or deep-link URLs (/messages, /post/:id, etc.)
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: HTML_SHELL_CACHE,
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      {
        cacheWillUpdate: async ({ response }) => {
          if (!response || response.status !== 200) return null;
          const ct = String(response.headers.get('content-type') || '').toLowerCase();
          return ct.includes('text/html') ? response : null;
        },
        handlerDidError: async () => {
          const shellCache = await caches.open(HTML_SHELL_CACHE);
          return (
            (await shellCache.match('/')) ||
            (await shellCache.match('/index.html')) ||
            (await caches.match('/')) ||
            (await caches.match('/index.html')) ||
            Response.error()
          );
        },
      },
    ],
  })
);

// Cache content-hashed JS/CSS assets ONLY when response is genuine JS/CSS (never cache HTML 404 fallback pages!)
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/assets/') &&
    (request.destination === 'script' || request.destination === 'style' || /\.(js|css)$/i.test(url.pathname)) &&
    !url.pathname.includes('group1-shard'),
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (!response || response.status !== 200) return null;
          const ct = String(response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) return null;
          return response;
        },
      },
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 14 * 24 * 60 * 60,
      }),
    ],
  })
);

// Cache 3D Nexto GLB model so the floating 3D robot loads instantaneously on repeat opens
registerRoute(
  ({ url }) => url.pathname.endsWith('.glb'),
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (!response || response.status !== 200) return null;
          const ct = String(response.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) return null;
          return response;
        },
      },
      new ExpirationPlugin({
        maxEntries: 6,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

declare const importScripts: (...urls: string[]) => void;

const firebaseConfig = {
  projectId: "next-489515",
  appId: "1:947258146571:web:2dd66aa09474e5f7d22c0e",
  apiKey: "AIzaSyAiczfp6lTr57-VrZyJXZKWbHKx32kBBtg",
  authDomain: "next-489515.firebaseapp.com",
  storageBucket: "next-489515.firebasestorage.app",
  messagingSenderId: "947258146571"
};

try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
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

  // Strictly enforce same-origin relative routes (block external phishing redirects or // scheme-relative URLs)
  try {
    if (typeof urlToOpen !== 'string') {
      urlToOpen = '/';
    } else {
      const trimmed = urlToOpen.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const parsed = new URL(trimmed);
        if (parsed.origin === self.location.origin) {
          urlToOpen = parsed.pathname + parsed.search + parsed.hash;
        } else {
          urlToOpen = '/';
        }
      } else {
        urlToOpen = trimmed;
      }
      if (!urlToOpen.startsWith('/') || urlToOpen.startsWith('//') || urlToOpen.includes('\\')) {
        urlToOpen = '/';
      }
      const lower = urlToOpen.toLowerCase();
      if (lower.includes('javascript:') || lower.includes('data:')) {
        urlToOpen = '/';
      }
    }
  } catch (_) {
    urlToOpen = '/';
  }

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
