import { getAuthHeaders } from './clientAuth';

const callCacheApi = async (payload: Record<string, any>, needsAuth = false) => {
  try {
    const headers = needsAuth
      ? await getAuthHeaders({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/cache', {
      method: 'POST',
      headers,
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
    const isPublicKey = key.startsWith('posts_cache_') || key.startsWith('reels_cache_') || key.startsWith('feed_cache_');
    const data = await callCacheApi({ action: 'get', key }, !isPublicKey);
    return data?.result ?? null;
  },
  set: async (key: string, value: any) => {
    await callCacheApi({ action: 'set', key, value }, true);
  },
  setex: async (key: string, ttl: number, value: any) => {
    await callCacheApi({ action: 'setex', key, ttl, value }, true);
  },
  del: async (...keys: string[]) => {
    await callCacheApi({ action: 'del', keys }, true);
  },
  keys: async (_pattern: string) => {
    return [];
  },
};

export const invalidatePostsCache = async () => {
  try {
    await callCacheApi({ action: 'invalidate-posts' }, true);
  } catch (e) {
    console.error('Redis invalidation error:', e);
  }
};
