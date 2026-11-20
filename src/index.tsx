import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import * as idb from 'idb-keyval';
import { registerSW } from 'virtual:pwa-register';

// 1. Immediate Top-Level Chunk Loading Failure Handler (Prevents White Screen on deployment updates)
const handleTopLevelChunkFailure = async (err: any) => {
  const msg = String(err?.message || err?.reason?.message || err || '');
  const isChunkErr =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed');

  if (isChunkErr) {
    console.warn("⚠️ [Deploy Recovery] Chunk load failure intercepted. Cleaning transient script cache...", msg);
    const reloadKey = 'chunk_reload_lock_root';
    const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
    if (Date.now() - lastReload > 8000) {
      sessionStorage.setItem(reloadKey, String(Date.now()));
      if ('caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n)));
        } catch (_) {}
      }
      window.location.reload();
    }
  }
};

window.addEventListener('error', (e) => handleTopLevelChunkFailure(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => handleTopLevelChunkFailure(e.reason));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 mins
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota limit exceeded')) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

// 2. Safe IndexedDB Persister (Never throws, hangs, or corrupts React mount)
const idbStorage = {
  getItem: async (key: string) => {
    try {
      const val = await Promise.race([
        idb.get(key),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      return val ?? null;
    } catch (e) {
      console.warn("idbStorage read error handled safely:", e);
      return null;
    }
  },
  setItem: async (key: string, value: any) => {
    try {
      await idb.set(key, value);
    } catch (e) {
      console.warn("idbStorage write warning:", e);
    }
  },
  removeItem: async (key: string) => {
    try {
      await idb.del(key);
    } catch (e) {
      console.warn("idbStorage delete warning:", e);
    }
  },
};

const persister = createAsyncStoragePersister({
  storage: idbStorage,
  throttleTime: 2000,
});

// Request persistent storage so Dexie / IndexedDB data is never purged on restart
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

import {
  checkRelatedAppsForUninstall,
  handleAppInstalledForReinstallCheck,
  handleBeforeInstallPromptForReinstallCheck,
  isStandaloneMode,
  markPwaInstalled,
} from './lib/pwaInstallAuth';

// Global listener for PWA install prompt & uninstall/reinstall detection
(window as any).deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredInstallPrompt = e;
  handleBeforeInstallPromptForReinstallCheck().catch(() => {});
});

window.addEventListener('appinstalled', () => {
  (window as any).deferredInstallPrompt = null;
  handleAppInstalledForReinstallCheck().catch(() => {});
});

if (isStandaloneMode()) {
  markPwaInstalled();
} else {
  checkRelatedAppsForUninstall().catch(() => {});
}

// Expose queryClient globally
(window as any).queryClient = queryClient;

// 3. Register PWA service worker with update notifications
const updateSW = registerSW({
  onNeedRefresh() {
    console.log("New version available, activating updated Service Worker...");
    updateSW(true);
    window.dispatchEvent(new CustomEvent('next_sw_updated'));
  },
  onOfflineReady() {
    console.log('App is ready to work offline');
  },
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('next_sw_updated'));
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      window.dispatchEvent(new CustomEvent('next_sw_updated', { detail: { version: event.data.version } }));
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 4. Modern Branded ErrorBoundary (No White Screen of Death)
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  handleCleanAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch (_) {}
    const cleanUrl = window.location.origin + window.location.pathname + '?_bust=' + Date.now() + window.location.hash;
    window.location.replace(cleanUrl);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#18191A] flex items-center justify-center p-4 font-sans text-gray-900 dark:text-gray-100">
          <div className="max-w-md w-full bg-white dark:bg-[#242526] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-[#1877F2] to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              N
            </div>
            <h2 className="text-xl font-bold mb-2">Next অ্যাপে নতুন আপডেট এসেছে</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              অ্যাপটির নতুন সংস্করণ সক্রিয় করতে নিচের বাটনে চাপ দিন। আপনার কোনো চ্যাট বা ডেটা ডিলিট হবে না।
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleCleanAndReload}
                className="w-full py-3 px-4 bg-[#1877F2] hover:bg-blue-600 active:scale-98 text-white font-semibold rounded-xl shadow-md transition-all cursor-pointer"
              >
                আপডেট ও রিলোড করুন (Update & Reload)
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl text-sm transition-all cursor-pointer"
              >
                আবার চেষ্টা করুন (Try Again)
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left text-xs text-gray-400 cursor-pointer">
                <summary className="hover:underline">বিস্তারিত ত্রুটি (Technical Details)</summary>
                <pre className="mt-2 p-2 bg-gray-50 dark:bg-black/30 rounded border border-gray-200 dark:border-gray-800 overflow-x-auto text-[11px]">
                  {this.state.error.message || String(this.state.error)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { UploadProvider } from './contexts/UploadContext';
import { Toaster } from 'sonner';

const root = ReactDOM.createRoot(rootElement);
(window as any).__NEXT_APP_MOUNTED = true;
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <UploadProvider>
          <Toaster position="top-center" richColors theme="system" />
          <App />
        </UploadProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
