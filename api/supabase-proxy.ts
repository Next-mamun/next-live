import {
  applySecurityHeaders,
  checkRateLimit,
  getAllowedCorsOrigin,
  getClientIp,
  isSafeSupabaseProxyPath,
  verifyFirebaseCaller,
} from './_security';

const getValidSupabaseUrl = (): string => {
  let raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://zdrubxtuxotqyasmsuqz.supabase.co';

  if (!raw || typeof raw !== 'string') {
    return 'https://zdrubxtuxotqyasmsuqz.supabase.co';
  }
  raw = raw.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }
  return `https://${raw}${raw.includes('.') ? '' : '.supabase.co'}`;
};

const FORWARD_REQUEST_HEADERS = [
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

const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'preference-applied',
  'x-supabase-api-version',
];

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: any): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  applySecurityHeaders(res);

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
    (typeof req.headers?.['x-supabase-path'] === 'string' ? req.headers['x-supabase-path'] : '');

  if (!isSafeSupabaseProxyPath(rawPath)) {
    return res.status(400).json({ error: 'Invalid Supabase proxy path' });
  }

  const method = String(req.method || 'GET').toUpperCase();
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

  const baseUrl = getValidSupabaseUrl();
  const targetUrl = `${baseUrl}${rawPath}`;

  const forwardHeaders: Record<string, string> = {};
  for (const key of FORWARD_REQUEST_HEADERS) {
    const val = req.headers?.[key];
    if (typeof val === 'string' && val.length > 0) {
      forwardHeaders[key] = val;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const bodyBuffer = await readRawBody(req);
    const upstreamResp = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
      signal: controller.signal,
    });

    for (const key of FORWARD_RESPONSE_HEADERS) {
      const val = upstreamResp.headers.get(key);
      if (val) {
        res.setHeader(key, val);
      }
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const arrayBuf = await upstreamResp.arrayBuffer();
    return res.status(upstreamResp.status).send(Buffer.from(arrayBuf));
  } catch (err: any) {
    console.error('[supabase-proxy] Upstream error:', err?.message || err);
    return res.status(502).json({
      error: 'Supabase upstream unreachable',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
