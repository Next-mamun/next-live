/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

const SW_VERSION = String((import.meta as any).env?.VITE_BUILD_TIME || 'v3');
// Versioned HTML shell cache guarantees stale index.html from old builds is purged automatically on activate
const HTML_SHELL_CACHE = `next-html-shell-${SW_VERSION}`;
const ASSETS_CACHE = 'next-assets-v3';
const SW_META_CACHE = 'next-sw-meta';

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute((self as any).__WB_MANIFEST || []);

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const metaCache = await caches.open(SW_META_CACHE);
      const prevVerResp = await metaCache.match('/__sw_version');
      const prevVer = prevVerResp ? await prevVerResp.text() : null;

      const allKeys = await caches.keys();
      await Promise.all(
        allKeys.map((key) => {
          const isCurrentWorkbox = key.startsWith('workbox-');
          const isCurrentCustom =
            key === HTML_SHELL_CACHE ||
            key === ASSETS_CACHE ||
            key === SW_META_CACHE;
          if (!isCurrentWorkbox && !isCurrentCustom) {
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

// Always prioritize fresh network HTML with a generous 12s timeout so mobile carriers aren't falsely timed out into stale caches
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: HTML_SHELL_CACHE,
    networkTimeoutSeconds: 12,
    fetchOptions: {
      cache: 'no-store',
    },
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

// Cache 3D Nexto GLB model lazily once fetched
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

// Handle FCM / Web Push notifications natively without blocking Service Worker startup on external gstatic importScripts
self.addEventListener('push', (event: any) => {
  if (!event) return;
  event.waitUntil((async () => {
    try {
      let payload: any = {};
      if (event.data) {
        try {
          payload = event.data.json();
        } catch {
          const txt = event.data.text ? event.data.text() : '';
          payload = { notification: { title: 'Next', body: txt || 'New notification' } };
        }
      }

      const data = payload?.data || {};

      // Silent FCM Push Purge
      if (data.action === 'DELETE_POST' && data.postId) {
        const targetId = data.postId;
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
            } catch (_) {
            } finally {
              idb.close();
            }
          };
        } catch (_) {}
        return;
      }

      const notificationTitle = payload?.notification?.title || data.title || 'New Message';
      const safeIcon =
        data.sender_avatar && String(data.sender_avatar).startsWith('https://')
          ? data.sender_avatar
          : '/favicon.ico';

      const notificationOptions: NotificationOptions & { renotify?: boolean } = {
        body: payload?.notification?.body || data.body || 'You have a new notification',
        icon: safeIcon,
        badge: '/favicon.ico',
        tag: data.chat_id || data.sender_id || 'next_notification',
        renotify: true,
        data,
      };

      await self.registration.showNotification(notificationTitle, notificationOptions);
    } catch (_) {}
  })());
});

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
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
