import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

export const AUTO_LOGIN_REINSTALL_KEY = 'next_auto_login_reinstall';
const PWA_INSTALLED_KEY = 'next_pwa_installed';
const PWA_WAS_UNINSTALLED_KEY = 'next_pwa_was_uninstalled';
const PENDING_REINSTALL_LOGOUT_KEY = 'next_pending_reinstall_logout';

export const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean((window.navigator as any).standalone) ||
    Boolean(document.referrer && document.referrer.includes('android-app://'))
  );
};

export const isAutoLoginOnReinstallEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(AUTO_LOGIN_REINSTALL_KEY) === 'true';
  } catch (_) {
    return false;
  }
};

export const setAutoLoginOnReinstallEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_LOGIN_REINSTALL_KEY, String(Boolean(enabled)));
    if (enabled) {
      localStorage.removeItem(PENDING_REINSTALL_LOGOUT_KEY);
    }
  } catch (_) {}
};

export const markPwaInstalled = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PWA_INSTALLED_KEY, '1');
    localStorage.removeItem(PWA_WAS_UNINSTALLED_KEY);
  } catch (_) {}
};

export const consumePendingReinstallLogout = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (isAutoLoginOnReinstallEnabled()) {
      localStorage.removeItem(PENDING_REINSTALL_LOGOUT_KEY);
      return false;
    }
    const pending = localStorage.getItem(PENDING_REINSTALL_LOGOUT_KEY) === '1';
    if (pending) {
      localStorage.removeItem(PENDING_REINSTALL_LOGOUT_KEY);
      localStorage.removeItem('next_media_user');
      return true;
    }
  } catch (_) {}
  return false;
};

export const enforceFreshLoginAfterReinstall = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (isAutoLoginOnReinstallEnabled()) return;

  try {
    localStorage.removeItem('next_media_user');
    localStorage.removeItem(PENDING_REINSTALL_LOGOUT_KEY);
  } catch (_) {}

  try {
    await signOut(auth);
  } catch (_) {}

  try {
    window.dispatchEvent(new CustomEvent('next_force_logout_reinstall'));
  } catch (_) {}
};

/**
 * Chrome/Android/Edge only fire `beforeinstallprompt` when the PWA is NOT currently installed.
 * If we previously recorded `next_pwa_installed === '1'`, the user uninstalled the PWA.
 */
export const handleBeforeInstallPromptForReinstallCheck = async (): Promise<void> => {
  if (typeof window === 'undefined' || isStandaloneMode()) return;
  try {
    const wasInstalled = localStorage.getItem(PWA_INSTALLED_KEY) === '1';
    if (!wasInstalled) return;

    localStorage.setItem(PWA_WAS_UNINSTALLED_KEY, '1');
    localStorage.setItem(PWA_INSTALLED_KEY, '0');

    if (!isAutoLoginOnReinstallEnabled()) {
      localStorage.setItem(PENDING_REINSTALL_LOGOUT_KEY, '1');
      await enforceFreshLoginAfterReinstall();
    }
  } catch (_) {}
};

/**
 * Fires when the PWA is installed (or reinstalled after uninstall).
 */
export const handleAppInstalledForReinstallCheck = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  try {
    const wasUninstalled = localStorage.getItem(PWA_WAS_UNINSTALLED_KEY) === '1';
    const wasPreviouslyInstalled = localStorage.getItem(PWA_INSTALLED_KEY) === '1';

    if ((wasUninstalled || wasPreviouslyInstalled) && !isAutoLoginOnReinstallEnabled()) {
      localStorage.setItem(PENDING_REINSTALL_LOGOUT_KEY, '1');
      await enforceFreshLoginAfterReinstall();
    }

    localStorage.setItem(PWA_INSTALLED_KEY, '1');
    localStorage.removeItem(PWA_WAS_UNINSTALLED_KEY);
  } catch (_) {}
};

/**
 * Uses Chrome's getInstalledRelatedApps API (when supported) in browser tab mode
 * to detect if a previously installed PWA was uninstalled.
 */
export const checkRelatedAppsForUninstall = async (): Promise<void> => {
  if (typeof window === 'undefined' || isStandaloneMode()) return;
  try {
    const wasInstalled = localStorage.getItem(PWA_INSTALLED_KEY) === '1';
    if (!wasInstalled) return;

    const nav = navigator as any;
    if (typeof nav.getInstalledRelatedApps !== 'function') return;

    const related = await nav.getInstalledRelatedApps();
    if (Array.isArray(related) && related.length === 0) {
      localStorage.setItem(PWA_WAS_UNINSTALLED_KEY, '1');
      localStorage.setItem(PWA_INSTALLED_KEY, '0');

      if (!isAutoLoginOnReinstallEnabled()) {
        localStorage.setItem(PENDING_REINSTALL_LOGOUT_KEY, '1');
        await enforceFreshLoginAfterReinstall();
      }
    }
  } catch (_) {}
};
