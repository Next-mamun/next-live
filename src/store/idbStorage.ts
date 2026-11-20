import { get, set, del } from 'idb-keyval';
import { StateStorage } from 'zustand/middleware';

export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const val = await Promise.race([
        get(name),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      return val || null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch {}
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch {}
  },
};
