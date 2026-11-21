import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { GoogleGenAI } from '@google/genai';
import {
  applySecurityHeaders,
  checkRateLimit,
  ensureFirebaseAdmin,
  getAllowedCorsOrigin,
  getClientIp,
  isSafeSupabaseProxyPath,
  sanitizeInternalAppUrl,
  verifyFirebaseCaller,
} from './api/_security';

function getValidSupabaseUrl(): string {
  let raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://zdrubxtuxotqyasmsuqz.supabase.co';

  if (!raw || typeof raw !== 'string') {
    return 'https://zdrubxtuxotqyasmsuqz.supabase.co';
  }
  raw = raw.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `https://${raw}${raw.includes('.') ? '' : '.supabase.co'}`;
}

function getFirebaseDatabaseId(): string | undefined {
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)') {
        return cfg.firestoreDatabaseId;
      }
    }
  } catch (e) {
    console.warn('Could not read firebase-applet-config.json:', e);
  }
  return undefined;
}

function getAdminFirestore() {
  const dbId = getFirebaseDatabaseId();
  return dbId ? getFirestore(admin.app(), dbId) : admin.firestore();
}

function getServerRedis(): Redis | null {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return null;
  }
  return new Redis({ url: redisUrl, token: redisToken });
}

function getServerAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

const ALLOWED_PUBLIC_CACHE_PREFIXES = ['posts_cache_', 'reels_cache_', 'feed_cache_'];
const ALLOWED_AUTH_CACHE_PREFIXES = [
  'posts_cache_',
  'reels_cache_',
  'feed_cache_',
  'messages_cache_',
  'friends_cache_',
  'user_cache_',
];

function isSafeCacheKey(key: unknown, prefixes: string[]): key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 160) return false;
  if (!/^[a-zA-Z0-9_\-:]+$/.test(key)) return false;
  return prefixes.some((p) => key.startsWith(p));
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const PORT = 3000;

  ensureFirebaseAdmin();

  app.use((_req, res, next) => {
    applySecurityHeaders(res);
    next();
  });

  // Same-origin Supabase Proxy fallback for BD carriers / restricted Wi-Fi blocking *.supabase.co
  app.all('/api/supabase-proxy', express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
    const allowedOrigin = getAllowedCorsOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (!allowedOrigin && req.headers?.origin) {
        return res.status(403).json({ error: 'Origin not allowed' });
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'apikey,authorization,content-type,accept,prefer,range,x-client-info,accept-profile,content-profile,x-upsert,x-firebase-token,x-supabase-path');
      return res.status(204).end();
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(`supa-proxy:${ip}`, 200, 60_000)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const rawPath =
      (typeof req.query?.path === 'string' ? req.query.path : '') ||
      (typeof req.headers['x-supabase-path'] === 'string' ? req.headers['x-supabase-path'] : '');

    if (!isSafeSupabaseProxyPath(rawPath)) {
      return res.status(400).json({ error: 'Invalid Supabase proxy path' });
    }

    const method = (req.method || 'GET').toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD';
    const isPrivateRead =
      rawPath.startsWith('/rest/v1/messages') ||
      rawPath.startsWith('/rest/v1/friendships') ||
      rawPath.startsWith('/rest/v1/rpc/');

    if (isMutation || isPrivateRead) {
      const caller = await verifyFirebaseCaller(req, 'x-firebase-token');
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }
    }

    const baseUrl = getValidSupabaseUrl().replace(/\/+$/, '');
    const targetUrl = `${baseUrl}${rawPath}`;
    const allowHeaders = [
      'apikey',
      'authorization',
      'content-type',
      'accept',
      'prefer',
      'range',
      'x-client-info',
      'accept-profile',
      'content-profile',
      'x-upsert',
    ];
    const forwardHeaders: Record<string, string> = {};
    for (const h of allowHeaders) {
      const val = req.headers[h];
      if (typeof val === 'string' && val.length > 0) {
        forwardHeaders[h] = val;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const hasBody = method !== 'GET' && method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length > 0;
      const upstreamResp = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: hasBody ? new Uint8Array(req.body) : undefined,
        signal: controller.signal,
      });

      const respHeaders = ['content-type', 'content-range', 'preference-applied', 'x-supabase-api-version'];
      for (const h of respHeaders) {
        const val = upstreamResp.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      const buf = Buffer.from(await upstreamResp.arrayBuffer());
      return res.status(upstreamResp.status).send(buf);
    } catch (err: any) {
      console.warn('[supabase-proxy] Upstream error:', err?.message || err);
      return res.status(502).json({ error: 'Supabase upstream unreachable' });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.use(express.json({ limit: '10mb' }));

  // Public minimal health endpoint; detailed diagnostics require HEALTH_CHECK_SECRET
  app.get('/api/health', async (req, res) => {
    const providedSecret = req.headers['x-health-secret'];
    const configuredSecret = process.env.HEALTH_CHECK_SECRET;
    const isAuthorizedDetail = Boolean(configuredSecret && providedSecret === configuredSecret);

    if (!isAuthorizedDetail) {
      return res.status(200).json({
        timestamp: new Date().toISOString(),
        status: 'OK',
      });
    }

    const status: Record<string, string> = {
      supabase: 'OFFLINE',
      redis: 'OFFLINE',
      firebase: 'OFFLINE',
      cloudinary: 'OFFLINE',
      gemini: 'OFFLINE',
    };

    try {
      const supabaseUrl = getValidSupabaseUrl();
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { error } = await supabase.from('profiles').select('id').limit(1);
        if (!error) status.supabase = 'ONLINE';
      }
    } catch {}

    try {
      const redis = getServerRedis();
      if (redis && (await redis.ping()) === 'PONG') {
        status.redis = 'ONLINE';
      }
    } catch {}

    try {
      const db = getAdminFirestore();
      await db.listCollections();
      status.firebase = 'ONLINE';
    } catch {}

    try {
      const fetchResponse = await fetch('https://api.cloudinary.com/v1_1/dcwe6ln0h/image/upload', { method: 'POST' });
      if (fetchResponse.status === 400 || fetchResponse.ok) status.cloudinary = 'ONLINE';
    } catch {}

    try {
      if (process.env.GEMINI_API_KEY) {
        const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        if (fetchResponse.ok) status.gemini = 'ONLINE';
      }
    } catch {}

    const allOnline = Object.values(status).every((v) => v === 'ONLINE');
    return res.status(allOnline ? 200 : 500).json({
      timestamp: new Date().toISOString(),
      status: allOnline ? 'HEALTHY' : 'DEGRADED',
      services: status,
    });
  });

  // Server-side Gemini AI Endpoints (Authenticated + Rate Limited + Bounded)
  app.post('/api/ai/enhance-post', async (req, res) => {
    const caller = await verifyFirebaseCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const ip = getClientIp(req);
    if (!checkRateLimit(`ai-enhance:${caller.uid}:${ip}`, 15, 60_000)) {
      return res.status(429).json({ error: 'Too many AI requests' });
    }

    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    const trimmedText = text.trim().slice(0, 2000);
    if (!trimmedText) {
      return res.status(400).json({ error: 'text is required' });
    }

    const ai = getServerAiClient();
    if (!ai) {
      return res.json({ text: trimmedText });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Enhance the following social media post to make it more engaging and friendly, keeping it concise. Return only the improved post text without extra commentary.\n\nPost:\n${trimmedText}`,
      });
      return res.json({ text: response.text || trimmedText });
    } catch (error: any) {
      console.error('Gemini enhance-post error:', error?.message || error);
      return res.json({ text: trimmedText });
    }
  });

  app.post('/api/ai/generate-bio', async (req, res) => {
    const caller = await verifyFirebaseCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const ip = getClientIp(req);
    if (!checkRateLimit(`ai-bio:${caller.uid}:${ip}`, 10, 60_000)) {
      return res.status(429).json({ error: 'Too many AI requests' });
    }

    const { username } = req.body || {};
    const safeName =
      typeof username === 'string' && username.trim()
        ? username.trim().replace(/[^a-zA-Z0-9._\s-]/g, '').slice(0, 40) || 'friend'
        : 'friend';

    const ai = getServerAiClient();
    if (!ai) {
      return res.json({ bio: 'Just joined Next!' });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Create a funny and creative one-sentence bio for a social media user handle "${safeName}" for an app called Next. Output only one short sentence.`,
      });
      return res.json({ bio: (response.text || 'Just joined Next!').slice(0, 220) });
    } catch (error: any) {
      console.error('Gemini generate-bio error:', error?.message || error);
      return res.json({ bio: 'Exploring the world of Next.' });
    }
  });

  // Server-side Upstash Redis Cache Proxy (requires env vars; mutations require verified Firebase auth)
  app.post('/api/cache', async (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`cache:${ip}`, 120, 60_000)) {
      return res.status(429).json({ error: 'Too many cache requests' });
    }

    const { action, key, keys, value, ttl } = req.body || {};
    const redis = getServerRedis();
    if (!redis) {
      return res.status(200).json({ result: null, success: false });
    }

    try {
      if (action === 'get') {
        if (isSafeCacheKey(key, ALLOWED_PUBLIC_CACHE_PREFIXES)) {
          const result = await redis.get(key);
          return res.json({ result });
        }
        const caller = await verifyFirebaseCaller(req);
        if (!caller || !isSafeCacheKey(key, ALLOWED_AUTH_CACHE_PREFIXES)) {
          return res.status(403).json({ error: 'Access denied for cache key' });
        }
        const result = await redis.get(key);
        return res.json({ result });
      }

      const caller = await verifyFirebaseCaller(req);
      if (!caller) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (action === 'set' || action === 'setex') {
        if (!isSafeCacheKey(key, ALLOWED_AUTH_CACHE_PREFIXES)) {
          return res.status(403).json({ error: 'Invalid cache key' });
        }
        const serializedSize = JSON.stringify(value ?? null).length;
        if (serializedSize > 512 * 1024) {
          return res.status(413).json({ error: 'Cache payload too large' });
        }
        const boundedTtl = Math.min(Math.max(Number(ttl) || 60, 5), 3600);
        await redis.setex(key, boundedTtl, value);
        return res.json({ success: true });
      }

      if (action === 'del') {
        const rawList = Array.isArray(keys) ? keys.slice(0, 20) : typeof key === 'string' ? [key] : [];
        const targetKeys = rawList.filter((k) => isSafeCacheKey(k, ALLOWED_AUTH_CACHE_PREFIXES));
        if (targetKeys.length > 0) {
          await redis.del(...targetKeys);
        }
        return res.json({ success: true });
      }

      if (action === 'invalidate-posts') {
        const matched = await redis.keys('posts_cache_*');
        if (matched.length > 0) {
          await redis.del(...matched);
        }
        return res.json({ success: true, cleared: matched.length });
      }

      return res.status(400).json({ error: 'Invalid cache action' });
    } catch (err: any) {
      console.warn('Cache proxy error:', err?.message || err);
      return res.status(200).json({ result: null, success: false });
    }
  });

  app.post('/api/send-notification', async (req, res) => {
    const caller = await verifyFirebaseCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const ip = getClientIp(req);
    if (!checkRateLimit(`notif:${caller.uid}:${ip}`, 40, 60_000)) {
      return res.status(429).json({ error: 'Too many notification requests' });
    }

    const { token, title, body, data, userId } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
      return res.status(400).json({ error: 'Valid FCM token is required' });
    }

    try {
      const stringData: Record<string, string> = {};
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined && val !== null) {
            const strVal = typeof val === 'string' ? val : String(val);
            if (key === 'sender_avatar' && (strVal.startsWith('data:') || strVal.length > 512)) {
              continue;
            }
            stringData[key] = strVal.slice(0, 1000);
          }
        }
      }

      if (stringData.sender_id && stringData.sender_id !== caller.uid) {
        return res.status(403).json({ error: 'Sender identity mismatch' });
      }
      if (!stringData.sender_id) {
        stringData.sender_id = caller.uid;
      }

      const notifTitle = String(title || stringData.title || 'New Notification').slice(0, 120);
      const notifBody = String(body || stringData.body || '').slice(0, 300);
      const fallbackRoute = stringData.sender_id ? `/messages?user=${encodeURIComponent(stringData.sender_id)}` : '/messages';
      const safeRelativeUrl = sanitizeInternalAppUrl(stringData.url, fallbackRoute);

      stringData.url = safeRelativeUrl;
      stringData.title = notifTitle;
      stringData.body = notifBody;

      const reqOrigin =
        typeof req.headers.origin === 'string' && req.headers.origin.startsWith('https://')
          ? req.headers.origin
          : 'https://next-nexto.vercel.app';
      const absoluteHttpsLink = `${reqOrigin}${safeRelativeUrl}`;

      const safeIcon =
        stringData.sender_avatar && stringData.sender_avatar.startsWith('https://')
          ? stringData.sender_avatar
          : '/favicon.ico';

      const response = await admin.messaging().send({
        token,
        notification: {
          title: notifTitle,
          body: notifBody,
        },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            title: notifTitle,
            body: notifBody,
            sound: 'default',
            priority: 'max',
            channelId: 'high_importance_channel',
            defaultSound: true,
            defaultVibrateTimings: true,
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification: {
            title: notifTitle,
            body: notifBody,
            requireInteraction: true,
            icon: safeIcon,
            badge: '/favicon.ico',
            tag: stringData.chat_id || stringData.sender_id || 'next_notification',
            renotify: true,
            data: stringData,
          },
          fcmOptions: {
            link: absoluteHttpsLink,
          },
        },
      });
      res.json({ success: true, messageId: response });
    } catch (error: any) {
      const isNotRegistered =
        error?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
        error?.code === 'messaging/registration-token-not-registered' ||
        error?.code === 'messaging/invalid-registration-token' ||
        (typeof error?.message === 'string' &&
          (error.message.includes('NotRegistered') ||
            error.message.includes('registration-token-not-registered') ||
            error.message.includes('invalid-registration-token')));

      if (isNotRegistered) {
        console.log(`[FCM] Token no longer registered or expired (${token.substring(0, 10)}...). Removing stale token.`);

        try {
          const firestore = getAdminFirestore();
          if (userId) {
            firestore.collection('profiles').doc(userId).update({
              fcm_token: FieldValue.delete(),
            }).catch(() => {});
          } else {
            firestore
              .collection('profiles')
              .where('fcm_token', '==', token)
              .get()
              .then((snap) => {
                snap.forEach((d) => {
                  d.ref.update({ fcm_token: FieldValue.delete() }).catch(() => {});
                });
              })
              .catch(() => {});
          }
        } catch {}

        return res.json({ success: false, notRegistered: true, message: 'FCM token not registered or expired' });
      }

      console.warn('[FCM] Send notification warning:', error?.message || error);
      res.json({ success: false, error: 'Failed to send notification' });
    }
  });

  // Search Engine, Deep Linking & Crawler Routes
  app.get('/.well-known/assetlinks.json', (req, res) => {
    const assetlinksPath = path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
    if (fs.existsSync(assetlinksPath)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.sendFile(assetlinksPath, { dotfiles: 'allow' });
    }
    res.status(404).json({ error: 'assetlinks.json not found' });
  });

  app.get('/sitemap.xml', (req, res) => {
    const sitemapPath = path.join(process.cwd(), 'public', 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(sitemapPath);
    }
    res.status(404).send('Sitemap not found');
  });

  app.get('/robots.txt', (req, res) => {
    const robotsPath = path.join(process.cwd(), 'public', 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(robotsPath);
    }
    res.status(404).send('Robots.txt not found');
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    app.get('/sw.js', (req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(`
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
  firebase.initializeApp({
    projectId: "next-489515",
    appId: "1:947258146571:web:2dd66aa09474e5f7d22c0e",
    apiKey: "AIzaSyAiczfp6lTr57-VrZyJXZKWbHKx32kBBtg",
    authDomain: "next-489515.firebaseapp.com",
    storageBucket: "next-489515.firebasestorage.app",
    messagingSenderId: "947258146571"
  });
  var messaging = firebase.messaging();
  messaging.onBackgroundMessage(function(payload) {
    var data = payload.data || {};
    var title = (payload.notification && payload.notification.title) || data.title || 'New Notification';
    var body = (payload.notification && payload.notification.body) || data.body || 'You have a new message';
    self.registration.showNotification(title, {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.chat_id || data.sender_id || 'next_notification',
      renotify: true,
      data: data
    });
  });
} catch (e) {}
function sanitizeSwTarget(rawUrl) {
  if (typeof rawUrl !== 'string') return '/';
  var val = rawUrl.trim();
  if (!val) return '/';
  try {
    if (val.indexOf('http://') === 0 || val.indexOf('https://') === 0) {
      var parsed = new URL(val);
      if (parsed.origin !== self.location.origin) return '/';
      val = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch (e) { return '/'; }
  if (val.charAt(0) !== '/' || val.indexOf('//') === 0 || val.indexOf('\\\\') !== -1) return '/';
  return val;
}
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var data = event.notification.data || {};
  var rawUrl = (data.type === 'message' && data.sender_id)
    ? '/messages?user=' + encodeURIComponent(data.sender_id)
    : (data.url || '/');
  var urlToOpen = sanitizeSwTarget(rawUrl);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      if (clients && clients.length > 0) {
        var client = clients[0];
        try { client.postMessage({ type: 'NAVIGATE', url: urlToOpen }); } catch (e) {}
        if (client.focus) return client.focus();
        return client;
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});
`);
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        dotfiles: 'allow',
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('.html') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('version.json') ||
            filePath.endsWith('manifest.json')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.use((req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
