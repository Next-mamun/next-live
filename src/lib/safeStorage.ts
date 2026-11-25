const memLocal = new Map<string, string>();
const memSession = new Map<string, string>();

export function safeLocalGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to in-memory map when storage is blocked (Safari Private / strict WebViews)
  }
  return memLocal.has(key) ? memLocal.get(key)! : null;
}

export function safeLocalSet(key: string, value: string): void {
  memLocal.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore SecurityError / QuotaExceededError
  }
}

export function safeLocalRemove(key: string): void {
  memLocal.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
}

export function safeLocalClear(): void {
  memLocal.clear();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  } catch {}
}

export function safeSessionGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {}
  return memSession.has(key) ? memSession.get(key)! : null;
}

export function safeSessionSet(key: string, value: string): void {
  memSession.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {}
}

export function safeSessionRemove(key: string): void {
  memSession.delete(key);
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {}
}

export function safeSessionClear(): void {
  memSession.clear();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch {}
}
