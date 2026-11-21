import { createClient } from '@supabase/supabase-js';

const getValidSupabaseUrl = () => {
  let raw = 
    (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_URL : '') ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    'https://zdrubxtuxotqyasmsuqz.supabase.co';

  if (!raw || typeof raw !== 'string') {
    return 'https://zdrubxtuxotqyasmsuqz.supabase.co';
  }

  raw = raw.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  // If it's just the project ref (e.g. zdrubxtuxotqyasmsuqz)
  return `https://${raw}${raw.includes('.') ? '' : '.supabase.co'}`;
};

const supabaseUrl = getValidSupabaseUrl();

const supabaseAnonKey = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY : '') ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkcnVieHR1eG90cXlhc21zdXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjYwMjUsImV4cCI6MjA4NzAwMjAyNX0.bmabhbjLx_ZUmW0wJRx9fUY8Noiv9dz8i-pzWe-PEyI';

const PROXY_STORAGE_KEY = 'next_supa_proxy_until';
const PROXYABLE_PREFIXES = ['/rest/v1/', '/auth/v1/', '/storage/v1/'];

const getProxyFallbackUntil = (): number => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return Number(window.localStorage.getItem(PROXY_STORAGE_KEY) || '0') || 0;
    }
  } catch {}
  return proxyFallbackUntilMem;
};

const setProxyFallbackUntil = (ts: number) => {
  proxyFallbackUntilMem = ts;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (ts > 0) {
        window.localStorage.setItem(PROXY_STORAGE_KEY, String(ts));
      } else {
        window.localStorage.removeItem(PROXY_STORAGE_KEY);
      }
    }
  } catch {}
};

let proxyFallbackUntilMem = 0;

const fetchWithTimeout = async (
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let abortedByExternal = false;

  const onExternalAbort = () => {
    abortedByExternal = true;
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortedByExternal = true;
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (abortedByExternal) {
      err._externalAbort = true;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
};

const resilientSupabaseFetch: typeof fetch = async (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (typeof window === 'undefined' || !rawUrl.startsWith(supabaseUrl)) {
    return fetch(input, init);
  }

  let pathAndQuery = '';
  try {
    const parsed = new URL(rawUrl);
    pathAndQuery = `${parsed.pathname}${parsed.search}`;
  } catch {
    return fetch(input, init);
  }

  const isProxyable = PROXYABLE_PREFIXES.some((p) => pathAndQuery.startsWith(p));
  if (!isProxyable) {
    return fetchWithTimeout(rawUrl, init, 8000);
  }

  const proxyUrl = `${window.location.origin}/api/supabase-proxy?path=${encodeURIComponent(pathAndQuery)}`;

  // Build normalized RequestInit when falling back to Request object inputs
  const normalizedInit: RequestInit = init ? { ...init } : {};
  if (typeof input !== 'string' && !(input instanceof URL)) {
    if (!normalizedInit.method) normalizedInit.method = input.method;
    if (!normalizedInit.headers) normalizedInit.headers = input.headers;
    if (!normalizedInit.signal && input.signal) normalizedInit.signal = input.signal;
    if (!normalizedInit.body && input.method !== 'GET' && input.method !== 'HEAD') {
      try {
        normalizedInit.body = await input.clone().arrayBuffer();
      } catch {}
    }
  }

  const attachFirebaseProxyHeader = async (baseInit: RequestInit): Promise<RequestInit> => {
    try {
      const { getFirebaseIdToken } = await import('./clientAuth');
      const fbToken = await getFirebaseIdToken(1200);
      if (!fbToken) return baseInit;
      const mergedHeaders = new Headers(baseInit.headers || undefined);
      mergedHeaders.set('x-firebase-token', fbToken);
      return { ...baseInit, headers: mergedHeaders };
    } catch {
      return baseInit;
    }
  };

  // If direct domain recently stalled/blocked on this carrier, use same-origin proxy immediately
  if (Date.now() < getProxyFallbackUntil()) {
    try {
      const proxyInit = await attachFirebaseProxyHeader(normalizedInit);
      return await fetchWithTimeout(proxyUrl, proxyInit, 12000);
    } catch {
      // If proxy itself hiccupped, clear flag and fall through to direct try
      setProxyFallbackUntil(0);
    }
  }

  try {
    return await fetchWithTimeout(rawUrl, normalizedInit, 3500);
  } catch (err: any) {
    if (err?._externalAbort) {
      throw err;
    }
    // BD carrier / restricted Wi-Fi likely blocking/dropping *.supabase.co -> fail over cleanly to /api/supabase-proxy for 30m
    setProxyFallbackUntil(Date.now() + 30 * 60 * 1000);
    const proxyInit = await attachFirebaseProxyHeader(normalizedInit);
    return await fetchWithTimeout(proxyUrl, proxyInit, 12000);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: resilientSupabaseFetch,
  },
  realtime: {
    params: {
      eventsPerSecond: 25,
    },
  },
});


