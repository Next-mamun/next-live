import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

function getValidSupabaseUrl() {
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

function getFirebaseDatabaseId() {
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)') {
        return cfg.firestoreDatabaseId;
      }
    }
  } catch (_) {}
  return undefined;
}

export async function GET() {
  const status = {
    supabase: 'OFFLINE',
    redis: 'OFFLINE',
    firebase: 'OFFLINE',
    cloudinary: 'OFFLINE',
    gemini: 'OFFLINE',
  };

  const errors = {};

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
  } catch (err) {
    errors.supabase = err.message || String(err);
  }

  // 2. Check Upstash Redis
  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.VITE_UPSTASH_REDIS_REST_URL || 'https://relative-oyster-81682.upstash.io';
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.VITE_UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAT8SAAIgcDFkZTBkNjg1ZmE2NzE0NjFkYjUzOGU3MTRkYWM2YzgwZQ';
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const ping = await redis.ping();
    if (ping === 'PONG') {
      status.redis = 'ONLINE';
    } else {
      errors.redis = `Ping returned: ${ping}`;
    }
  } catch (err) {
    errors.redis = err.message || String(err);
  }

  // 3. Check Firebase Admin SDK
  try {
    if (admin.apps.length === 0) {
      const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (saVar) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(saVar))
        });
      } else {
        admin.initializeApp();
      }
    }
    const dbId = getFirebaseDatabaseId();
    const db = dbId ? getFirestore(admin.app(), dbId) : admin.firestore();
    await db.listCollections();
    status.firebase = 'ONLINE';
  } catch (err) {
    errors.firebase = err.message || String(err);
  }

  // 4. Check Cloudinary
  try {
    const cloudName = 'dcwe6ln0h';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
    });
    if (res.status === 400 || res.ok) {
      status.cloudinary = 'ONLINE';
    } else {
      errors.cloudinary = `HTTP Status: ${res.status}`;
    }
  } catch (err) {
    errors.cloudinary = err.message || String(err);
  }

  // 5. Check Gemini API
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (res.ok) {
        status.gemini = 'ONLINE';
      } else {
        errors.gemini = `HTTP Status: ${res.status}`;
      }
    } else {
      errors.gemini = 'GEMINI_API_KEY environment variable is not defined';
    }
  } catch (err) {
    errors.gemini = err.message || String(err);
  }

  const allOnline = Object.values(status).every(v => v === 'ONLINE');

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    status: allOnline ? 'HEALTHY' : 'DEGRADED',
    services: status,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }), {
    status: allOnline ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
