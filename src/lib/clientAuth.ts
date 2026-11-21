import { auth } from './firebase';

export async function getFirebaseIdToken(waitMs = 1500): Promise<string | null> {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }

    if (typeof window === 'undefined') return null;

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub();
          resolve(null);
        }
      }, waitMs);

      const unsub = auth.onAuthStateChanged(async (user) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsub();
        if (!user) {
          resolve(null);
          return;
        }
        try {
          resolve(await user.getIdToken());
        } catch {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}

export async function getAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = await getFirebaseIdToken(1200);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
