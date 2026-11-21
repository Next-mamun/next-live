
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? new Date() : date;
  }
  if (typeof date === 'number') {
    return new Date(date < 10000000000 ? date * 1000 : date);
  }
  if (typeof date?.toDate === 'function') {
    try {
      const d = date.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {}
  }
  if (typeof date?.toMillis === 'function') {
    try {
      const ms = date.toMillis();
      if (typeof ms === 'number') return new Date(ms);
    } catch (e) {}
  }
  if (typeof date === 'object' && typeof date?.seconds === 'number') {
    return new Date(date.seconds * 1000 + (date.nanoseconds ? Math.floor(date.nanoseconds / 1000000) : 0));
  }
  if (typeof date === 'object' && typeof date?._seconds === 'number') {
    return new Date(date._seconds * 1000);
  }
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (!trimmed) return new Date();
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      return new Date(num < 10000000000 ? num * 1000 : num);
    }
  }
  return new Date();
}

export function formatTime(date: any, options: { showYear?: boolean, showSeconds?: boolean, relative?: boolean } = {}) {
  try {
    const d = parseDate(date);
    if (isNaN(d.getTime())) return 'Just now';

    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (options.relative !== false) {
      if (diffSec >= 0 && diffSec < 60) {
        return 'Just now';
      }
      if (diffMin > 0 && diffMin < 60) {
        return `${diffMin}m ago`;
      }
      if (diffHours > 0 && diffHours < 24) {
        return `${diffHours}h ago`;
      }
      if (diffDays === 1) {
        return `Yesterday`;
      }
      if (diffDays > 1 && diffDays < 7) {
        return `${diffDays}d ago`;
      }
    }

    return d.toLocaleString('en-US', {
      year: options.showYear ? 'numeric' : (d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined),
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: options.showSeconds ? '2-digit' : undefined,
      hour12: true
    });
  } catch (e) {
    return 'Just now';
  }
}

// Generate poster URL from video URLs (Cloudinary, YouTube, etc.)
export function getPosterUrl(url: string | undefined | null) {
  if (!url) return undefined;
  
  // YouTube video poster
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }

  // Cloudinary video poster
  if (url.includes('cloudinary.com') && url.includes('/video/upload/')) {
    return url.replace(/\.[^/.]+$/, ".jpg");
  }

  return undefined;
}

export function playInteractionSound(enabled: boolean) {
  if (!enabled) return;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio context failed", e);
  }
}

export function triggerHaptic(enabled: boolean) {
  if (!enabled) return;
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(50);
    } catch (e) {}
  }
}

export function optimizeCloudinaryUrl(
  url: string | undefined | null,
  options: { width?: number; type?: 'image' | 'video' | 'auto'; eco?: boolean } = {}
): string {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;

  const { width, type = 'image', eco = false } = options;
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  const [prefix, rest] = parts;
  // Skip if already transformed
  if (/^(f_auto|q_auto|w_\d+|c_limit)/.test(rest)) {
    return url;
  }

  const transforms: string[] = ['f_auto', eco ? 'q_auto:eco' : 'q_auto'];
  if (type === 'image' && width && width > 0) {
    transforms.push(`w_${width}`, 'c_limit');
  }

  return `${prefix}/upload/${transforms.join(',')}/${rest}`;
}

export function parseMessageJsonMeta(raw: any): {
  text: string;
  is_view_once: boolean;
  parent_message_id: string | null;
  filename?: string;
  file_size?: number;
} {
  if (!raw || typeof raw !== 'string') {
    return { text: '', is_view_once: false, parent_message_id: null };
  }
  const trimmed = raw.trim();
  if (trimmed.includes('"JSON_PAYLOAD"') || trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        return {
          text: typeof obj.text === 'string' ? obj.text : '',
          is_view_once: Boolean(obj.is_view_once),
          parent_message_id: obj.parent_message_id || null,
          filename: obj.filename,
          file_size: obj.file_size,
        };
      }
    } catch (_) {}
  }
  return { text: raw, is_view_once: false, parent_message_id: null };
}

export function isChatMuted(partnerId?: string | null): boolean {
  if (!partnerId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(`muted_${partnerId}`) === 'true';
  } catch {
    return false;
  }
}

export function getSafeMessagePreview(msg: any): string {
  if (!msg) return 'Sent a message';
  const rawContent = msg.content ?? msg.text ?? '';
  const meta = parseMessageJsonMeta(typeof rawContent === 'string' ? rawContent : '');
  const isViewOnce = Boolean(msg.is_view_once || meta.is_view_once);
  const mediaType = msg.media_type;

  if (isViewOnce) {
    if (mediaType === 'audio') return '🔒 Sent a View Once voice message';
    if (mediaType === 'video') return '🔒 Sent a View Once video';
    if (mediaType === 'document') return '🔒 Sent a View Once document';
    if (mediaType === 'image' || msg.media_url) return '🔒 Sent a View Once photo';
    return '🔒 Sent a View Once message';
  }

  try {
    if (typeof window !== 'undefined' && localStorage.getItem('hide_notification_previews') === 'true') {
      return 'New private message';
    }
  } catch (_) {}

  const cleanText = meta.text || (typeof rawContent === 'string' && !rawContent.trim().startsWith('{') ? rawContent : '');
  if (cleanText.trim()) return cleanText.trim();

  if (mediaType === 'audio') return '🎤 Sent a voice message';
  if (mediaType === 'video') return '🎥 Sent a video';
  if (mediaType === 'document') return `📄 Sent ${meta.filename || msg.filename || 'a document'}`;
  if (mediaType === 'image' || msg.media_url) return '📷 Sent a photo';
  return 'Sent a message';
}

export function normalizeAppRoute(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '/';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '/';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || trimmed.includes('\\')) {
    return '/';
  }

  try {
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('//')) return '/';
      const parsed = new URL(trimmed, 'https://next-nexto.vercel.app');
      parsed.searchParams.delete('fallback');
      parsed.searchParams.delete('_bust');
      const qs = parsed.searchParams.toString();
      const safePath = parsed.pathname.startsWith('//') ? '/' : parsed.pathname;
      return `${safePath}${qs ? `?${qs}` : ''}${parsed.hash || ''}` || '/';
    }

    // Handle https://, http://, or custom scheme like next://messages?user=123 or app://post/456
    const parsed = new URL(trimmed);
    const isCustomScheme = parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
    let pathname = parsed.pathname || '/';
    if (isCustomScheme && parsed.host) {
      pathname = `/${parsed.host}${pathname === '/' ? '' : pathname}`;
    }
    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
      pathname = '/';
    }
    parsed.searchParams.delete('fallback');
    parsed.searchParams.delete('_bust');
    const qs = parsed.searchParams.toString();
    return `${pathname}${qs ? `?${qs}` : ''}${parsed.hash || ''}` || '/';
  } catch {
    const safe = trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : '/';
    return safe;
  }
}


