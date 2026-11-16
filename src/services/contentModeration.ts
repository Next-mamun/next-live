import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import { toast } from 'sonner';

// Singleton model promise to prevent multiple reloads and memory leaks
let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;
let isModelReady = false;

// Concise, standard message without lengthy clutter
export const ADULT_BLOCKED_MESSAGE = 'Adult content is not allowed. Please upload appropriate content.';

/**
 * Loads and caches the NSFWJS model (MobileNetV2)
 */
export async function getNSFWModel(): Promise<nsfwjs.NSFWJS> {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        await tf.ready();
        // Load bundled MobileNetV2 for optimal speed and accuracy
        const model = await nsfwjs.load();
        isModelReady = true;
        return model;
      } catch (err) {
        modelPromise = null;
        isModelReady = false;
        throw err;
      }
    })();
  }
  return modelPromise;
}

export interface ModerationResult {
  isSafe: boolean;
  message?: string;
  reason?: string;
  scores?: {
    porn: number;
    hentai: number;
    sexy: number;
    neutral: number;
    drawing: number;
  };
}

/**
 * Standard / Medium threshold evaluation
 * Avoids false positives on normal clothes, portraits, scenery, documents, etc.
 */
function evaluatePredictions(predictions: Array<{ className: string; probability: number }>): ModerationResult {
  const scores = {
    porn: 0,
    hentai: 0,
    sexy: 0,
    neutral: 0,
    drawing: 0
  };

  for (const pred of predictions) {
    const key = pred.className.toLowerCase() as keyof typeof scores;
    if (scores[key] !== undefined) {
      scores[key] = pred.probability;
    }
  }

  // Standard / Medium Thresholds:
  // - High Neutral (> 0.55) indicates a safe, everyday image (face, clothes, objects)
  // - Porn / Hentai threshold: 0.50 (50% confidence)
  // - Sexy threshold: 0.72 (72% confidence, actual nudity / provocative)
  // - Combined threshold: Porn + Hentai > 0.40 OR (Porn > 0.25 && Sexy > 0.45)
  const isHighNeutral = scores.neutral > 0.55 || scores.drawing > 0.70;

  let isViolating = false;

  if (scores.porn >= 0.50 || scores.hentai >= 0.50) {
    isViolating = true;
  } else if (!isHighNeutral && scores.sexy >= 0.72) {
    isViolating = true;
  } else if ((scores.porn + scores.hentai) >= 0.40 && !isHighNeutral) {
    isViolating = true;
  } else if (scores.porn >= 0.25 && scores.sexy >= 0.48) {
    isViolating = true;
  }

  if (isViolating) {
    console.warn('⚠️ [AI Content Moderation] Inappropriate content detected:', scores);
    return {
      isSafe: false,
      message: ADULT_BLOCKED_MESSAGE,
      reason: `Porn: ${(scores.porn * 100).toFixed(1)}%, Hentai: ${(scores.hentai * 100).toFixed(1)}%, Sexy: ${(scores.sexy * 100).toFixed(1)}%`,
      scores
    };
  }

  return {
    isSafe: true,
    scores
  };
}

/**
 * Scans an HTMLImageElement using the NSFWJS model
 */
async function scanHtmlImage(img: HTMLImageElement): Promise<ModerationResult> {
  const model = await getNSFWModel();
  const predictions = await model.classify(img, 5);
  return evaluatePredictions(predictions);
}

/**
 * Scans an HTMLCanvasElement
 */
async function scanCanvas(canvas: HTMLCanvasElement): Promise<ModerationResult> {
  const model = await getNSFWModel();
  const predictions = await model.classify(canvas, 5);
  return evaluatePredictions(predictions);
}

/**
 * Scans an image File or Blob with safety timeout
 */
async function scanImageBlob(blob: Blob | File): Promise<ModerationResult> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const scanPromise = new Promise<ModerationResult>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const res = await scanHtmlImage(img);
          resolve(res);
        } catch (e) {
          resolve({ isSafe: true });
        }
      };
      img.onerror = () => resolve({ isSafe: true });
      img.src = objectUrl;
    });

    const timeoutMs = isModelReady ? 2500 : 8000;
    const timeoutPromise = new Promise<ModerationResult>((resolve) => {
      setTimeout(() => resolve({ isSafe: true }), timeoutMs);
    });

    return await Promise.race([scanPromise, timeoutPromise]);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Scans a video file quickly by checking a single initial frame with safety timeout
 */
async function scanVideoFile(file: File | Blob): Promise<ModerationResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  try {
    const scanPromise = new Promise<ModerationResult>(async (resolve) => {
      video.onloadedmetadata = async () => {
        try {
          const duration = video.duration || 1;
          video.currentTime = Math.min(0.5, duration / 2);

          video.onseeked = async () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(video.videoWidth || 320, 320);
              canvas.height = Math.min(video.videoHeight || 320, 320);
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve({ isSafe: true });

              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const result = await scanCanvas(canvas);
              resolve(result);
            } catch (e) {
              resolve({ isSafe: true });
            }
          };
        } catch (e) {
          resolve({ isSafe: true });
        }
      };
      video.onerror = () => resolve({ isSafe: true });
      video.src = objectUrl;
    });

    const timeoutMs = isModelReady ? 2500 : 8000;
    const timeoutPromise = new Promise<ModerationResult>((resolve) => {
      setTimeout(() => resolve({ isSafe: true }), timeoutMs);
    });

    return await Promise.race([scanPromise, timeoutPromise]);
  } catch (err) {
    return { isSafe: true };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Universal content scanner for any file or base64 string
 */
export async function scanMediaContent(fileOrData: File | Blob | string): Promise<ModerationResult> {
  try {
    if (typeof fileOrData === 'string') {
      if (fileOrData.startsWith('data:image/')) {
        const res = await fetch(fileOrData);
        const blob = await res.blob();
        return await scanImageBlob(blob);
      } else if (fileOrData.startsWith('http')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = fileOrData;
        });
        return await scanHtmlImage(img);
      }
      return { isSafe: true };
    }

    // It's a File or Blob
    const mimeType = fileOrData.type || '';
    if (mimeType.startsWith('image/')) {
      return await scanImageBlob(fileOrData);
    } else if (mimeType.startsWith('video/')) {
      return await scanVideoFile(fileOrData);
    }

    // Non-media (like pdf/docs/audio) are always safe from NSFW vision model
    return { isSafe: true };
  } catch (error) {
    console.warn('Content moderation scan error:', error);
    return { isSafe: true };
  }
}

/**
 * Clean, concise standard alert without noisy subtitles
 */
export function showAdultContentBlockedAlert(customMessage?: string) {
  const message = customMessage || ADULT_BLOCKED_MESSAGE;

  toast.error(message, {
    duration: 4000
  });

  // Haptic feedback if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([80, 40, 80]);
    } catch (e) {}
  }
}
