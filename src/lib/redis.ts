const callCacheApi = async (payload: Record<string, any>) => {
  try {
    const res = await fetch('/api/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

export const redis = {
  get: async (key: string) => {
    const data = await callCacheApi({ action: 'get', key });
    return data?.result ?? null;
  },
  set: async (key: string, value: any) => {
    await callCacheApi({ action: 'set', key, value });
  },
  setex: async (key: string, ttl: number, value: any) => {
    await callCacheApi({ action: 'setex', key, ttl, value });
  },
  del: async (...keys: string[]) => {
    await callCacheApi({ action: 'del', keys });
  },
  keys: async (pattern: string) => {
    const data = await callCacheApi({ action: 'keys', key: pattern });
    return Array.isArray(data?.result) ? data.result : [];
  },
};

export const invalidatePostsCache = async () => {
  try {
    await callCacheApi({ action: 'invalidate-posts' });
  } catch (e) {
    console.error('Redis invalidation error:', e);
  }
};
