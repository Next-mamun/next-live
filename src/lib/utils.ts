
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
