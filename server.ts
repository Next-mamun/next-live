import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { GoogleGenAI } from '@google/genai';

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

function getServerRedis() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.VITE_UPSTASH_REDIS_REST_URL || 'https://relative-oyster-81682.upstash.io';
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.VITE_UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAT8SAAIgcDFkZTBkNjg1ZmE2NzE0NjFkYjUzOGU3MTRkYWM2YzgwZQ';
  return new Redis({ url: redisUrl, token: redisToken });
}

function getServerAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount = null;

  if (serviceAccountVar) {
    try {
      serviceAccount = JSON.parse(serviceAccountVar);
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e);
    }
  } else {
    try {
      const saPath = path.join(process.cwd(), 'service-account.json');
      if (fs.existsSync(saPath)) {
         serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to read service-account.json:', e);
    }
  }

  let firebaseProjectId: string | undefined;
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      firebaseProjectId = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).projectId;
    }
  } catch {}

  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(firebaseProjectId ? { projectId: firebaseProjectId } : {})
      });
      console.log('Firebase Admin initialized with service account.');
    } catch (e) {
      console.error('Failed to initialize Firebase admin:', e);
    }
  } else {
    console.warn('Service account not found. Using default credentials.');
    try {
      admin.initializeApp(firebaseProjectId ? { projectId: firebaseProjectId } : undefined);
    } catch (e) {
      console.error('Default Admin initialization failed:', e);
    }
  }

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', async (req, res) => {
    const status: Record<string, string> = {
      supabase: 'OFFLINE',
      redis: 'OFFLINE',
      firebase: 'OFFLINE',
      cloudinary: 'OFFLINE',
      gemini: 'OFFLINE',
    };

    const errors: Record<string, string> = {};

    // 1. Check Supabase
    try {
      const supabaseUrl = getValidSupabaseUrl();
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkcnVieHR1eG90cXlhc21zdXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjYwMjUsImV4cCI6MjA4NzAwMjAyNX0.bmabhbjLx_ZUmW0wJRx9fUY8Noiv9dz8i-pzWe-PEyI';
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { error } = await supabase.from('messages').select('id').limit(1);
      if (!error) {
        status.supabase = 'ONLINE';
      } else {
        errors.supabase = error.message;
      }
    } catch (err: any) {
      errors.supabase = err.message || String(err);
    }

    // 2. Check Upstash Redis
    try {
      const redis = getServerRedis();
      const ping = await redis.ping();
      if (ping === 'PONG') {
        status.redis = 'ONLINE';
      } else {
        errors.redis = `Ping returned: ${ping}`;
      }
    } catch (err: any) {
      errors.redis = err.message || String(err);
    }

    // 3. Check Firebase Admin Connection
    try {
      const db = getAdminFirestore();
      await db.listCollections();
      status.firebase = 'ONLINE';
    } catch (err: any) {
      errors.firebase = err.message || String(err);
    }

    // 4. Check Cloudinary Server Availability
    try {
      const cloudName = 'dcwe6ln0h';
      const fetchResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
      });
      if (fetchResponse.status === 400 || fetchResponse.ok) {
        status.cloudinary = 'ONLINE';
      } else {
        errors.cloudinary = `HTTP Status: ${fetchResponse.status}`;
      }
    } catch (err: any) {
      errors.cloudinary = err.message || String(err);
    }

    // 5. Check Gemini API Connection
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (fetchResponse.ok) {
          status.gemini = 'ONLINE';
        } else {
          errors.gemini = `HTTP Status: ${fetchResponse.status}`;
        }
      } else {
        errors.gemini = 'GEMINI_API_KEY environment variable is not defined';
      }
    } catch (err: any) {
      errors.gemini = err.message || String(err);
    }

    const allOnline = Object.values(status).every(v => v === 'ONLINE');

    res.status(allOnline ? 200 : 500).json({
      timestamp: new Date().toISOString(),
      status: allOnline ? 'HEALTHY' : 'DEGRADED',
      services: status,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });
  });

  // Server-side Gemini AI Endpoints
  app.post('/api/ai/enhance-post', async (req, res) => {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    const ai = getServerAiClient();
    if (!ai) {
      return res.json({ text });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Enhance the following social media post to make it more engaging and friendly, but keep it concise: "${text}"`,
      });
      return res.json({ text: response.text || text });
    } catch (error: any) {
      console.error('Gemini enhance-post error:', error?.message || error);
      return res.json({ text });
    }
  });

  app.post('/api/ai/generate-bio', async (req, res) => {
    const { username } = req.body || {};
    const safeName = typeof username === 'string' && username.trim() ? username.trim() : 'friend';
    const ai = getServerAiClient();
    if (!ai) {
      return res.json({ bio: 'Just joined Next!' });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Create a funny and creative one-sentence bio for a user named ${safeName} for a new social media app called Next.`,
      });
      return res.json({ bio: response.text || 'Just joined Next!' });
    } catch (error: any) {
      console.error('Gemini generate-bio error:', error?.message || error);
      return res.json({ bio: 'Exploring the world of Next.' });
    }
  });

  // Server-side Upstash Redis Cache Proxy (keeps Redis token off the client)
  app.post('/api/cache', async (req, res) => {
    const { action, key, keys, value, ttl } = req.body || {};
    try {
      const redis = getServerRedis();
      if (action === 'get' && typeof key === 'string') {
        const result = await redis.get(key);
        return res.json({ result });
      }
      if (action === 'set' && typeof key === 'string') {
        await redis.set(key, value);
        return res.json({ success: true });
      }
      if (action === 'setex' && typeof key === 'string') {
        await redis.setex(key, Number(ttl) || 60, value);
        return res.json({ success: true });
      }
      if (action === 'del') {
        const targetKeys = Array.isArray(keys) ? keys : (typeof key === 'string' ? [key] : []);
        if (targetKeys.length > 0) {
          await redis.del(...targetKeys);
        }
        return res.json({ success: true });
      }
      if (action === 'keys' && typeof key === 'string') {
        const result = await redis.keys(key);
        return res.json({ result });
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
    const { token, title, body, data, userId } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    try {
      const stringData: Record<string, string> = {};
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined && val !== null) {
            stringData[key] = typeof val === 'string' ? val : String(val);
          }
        }
      }

      const notifTitle = String(title || 'New Notification');
      const notifBody = String(body || '');
      const targetUrl = stringData.url || (stringData.sender_id ? `/messages?user=${stringData.sender_id}` : '/messages');

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
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: {
            title: notifTitle,
            body: notifBody,
            requireInteraction: true,
            icon: stringData.sender_avatar || '/favicon.ico',
            badge: '/favicon.ico',
            tag: stringData.chat_id || stringData.sender_id || 'next_notification',
            renotify: true,
            data: stringData
          },
          fcmOptions: {
            link: targetUrl
          }
        }
      });
      res.json({ success: true, messageId: response });
    } catch (error: any) {
      const isNotRegistered = 
        error?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
        error?.code === 'messaging/registration-token-not-registered' ||
        error?.code === 'messaging/invalid-registration-token' ||
        (typeof error?.message === 'string' && (
          error.message.includes('NotRegistered') ||
          error.message.includes('registration-token-not-registered') ||
          error.message.includes('invalid-registration-token')
        ));

      if (isNotRegistered) {
        console.log(`[FCM] Token no longer registered or expired (${token.substring(0, 10)}...). Removing stale token.`);
        
        try {
          const firestore = getAdminFirestore();
          if (userId) {
            firestore.collection('profiles').doc(userId).update({
              fcm_token: FieldValue.delete()
            }).catch(() => {});
          } else {
            firestore.collection('profiles').where('fcm_token', '==', token).get().then(snap => {
              snap.forEach(d => {
                d.ref.update({ fcm_token: FieldValue.delete() }).catch(() => {});
              });
            }).catch(() => {});
          }
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }

        return res.json({ success: false, notRegistered: true, message: 'FCM token not registered or expired' });
      }

      console.warn('[FCM] Send notification warning:', error?.message || error);
      res.json({ success: false, error: error?.message || 'Failed to send notification' });
    }
  });

  // Search Engine & Crawler Routes
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (path.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
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
