import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

export interface VerifiedCaller {
  uid: string;
  email?: string;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function ensureFirebaseAdmin(): admin.app.App | null {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let projectId: string | undefined;
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      projectId = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).projectId;
    }
  } catch {
    // Ignore config read errors
  }

  let serviceAccount: any = null;
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
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

  try {
    if (serviceAccount) {
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(projectId ? { projectId } : {}),
      });
    }
    return admin.initializeApp(projectId ? { projectId } : undefined);
  } catch (e) {
    console.error('Firebase Admin init warning:', e);
    return admin.apps.length > 0 ? admin.app() : null;
  }
}

export function getClientIp(req: any): string {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim().slice(0, 64);
  }
  return String(req?.socket?.remoteAddress || req?.ip || 'unknown').slice(0, 64);
}

export function checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = rateLimitStore.get(bucketKey);

  if (!existing || now > existing.resetAt) {
    rateLimitStore.set(bucketKey, { count: 1, resetAt: now + windowMs });
    if (rateLimitStore.size > 5000) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (now > v.resetAt) rateLimitStore.delete(k);
      }
    }
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

export async function verifyFirebaseCaller(req: any, customHeaderName?: string): Promise<VerifiedCaller | null> {
  let token = '';

  if (customHeaderName) {
    const rawCustom = req?.headers?.[customHeaderName];
    if (typeof rawCustom === 'string' && rawCustom.trim()) {
      token = rawCustom.trim();
    }
  }

  if (!token) {
    const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token || token.length < 20 || token.length > 8192) {
    return null;
  }

  const app = ensureFirebaseAdmin();
  if (!app) return null;

  try {
    const decoded = await admin.auth(app).verifyIdToken(token);
    if (!decoded?.uid) return null;
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  } catch {
    return null;
  }
}

const ALLOWED_ROUTE_PREFIXES = [
  '/',
  '/messages',
  '/friends',
  '/post/',
  '/reels',
  '/profile/',
  '/notifications',
  '/cinema',
  '/meet',
  '/lab',
  '/settings',
];

export function sanitizeInternalAppUrl(rawUrl: unknown, fallback = '/'): string {
  if (typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;

  let pathAndQuery = trimmed;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed);
      const allowedHosts = new Set([
        'next-nexto.vercel.app',
        'localhost',
        '127.0.0.1',
      ]);
      if (!allowedHosts.has(parsed.hostname) && !parsed.hostname.endsWith('.run.app') && !parsed.hostname.endsWith('.vercel.app')) {
        return fallback;
      }
      pathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return fallback;
    }
  }

  if (!pathAndQuery.startsWith('/') || pathAndQuery.startsWith('//') || pathAndQuery.includes('\\')) {
    return fallback;
  }

  const lower = pathAndQuery.toLowerCase();
  if (lower.includes('javascript:') || lower.includes('data:') || lower.includes('vbscript:')) {
    return fallback;
  }

  const isAllowed = ALLOWED_ROUTE_PREFIXES.some((prefix) =>
    prefix === '/' ? pathAndQuery === '/' : pathAndQuery.startsWith(prefix)
  );
  return isAllowed ? pathAndQuery.slice(0, 500) : fallback;
}

export function isSafeSupabaseProxyPath(rawPath: string): boolean {
  if (!rawPath || typeof rawPath !== 'string') return false;
  if (rawPath.length > 2048) return false;

  const allowedPrefixes = ['/rest/v1/', '/auth/v1/', '/storage/v1/'];
  if (!allowedPrefixes.some((prefix) => rawPath.startsWith(prefix))) {
    return false;
  }

  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return false;
  }

  const rawPathOnly = rawPath.split('?')[0];
  const decodedPathOnly = decoded.split('?')[0];
  const checkPath = `${rawPathOnly} ${decodedPathOnly}`.toLowerCase();
  const checkFull = `${rawPath} ${decoded}`.toLowerCase();

  if (
    checkPath.includes('..') ||
    checkPath.includes('//') ||
    checkFull.includes('\\') ||
    checkFull.includes('\0') ||
    /[\r\n]/.test(checkFull)
  ) {
    return false;
  }

  return true;
}

export function getAllowedCorsOrigin(req: any): string | null {
  const origin = req?.headers?.origin;
  if (typeof origin !== 'string' || !origin) return null;

  try {
    const parsed = new URL(origin);
    const reqHost = String(req?.headers?.host || '').split(':')[0].toLowerCase();
    const originHost = parsed.hostname.toLowerCase();

    if (
      originHost === reqHost ||
      originHost === 'next-nexto.vercel.app' ||
      originHost === 'localhost' ||
      originHost === '127.0.0.1' ||
      originHost.endsWith('.run.app')
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function applySecurityHeaders(res: any): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
