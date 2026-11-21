import admin from 'firebase-admin';
import {
  applySecurityHeaders,
  checkRateLimit,
  ensureFirebaseAdmin,
  getClientIp,
  sanitizeInternalAppUrl,
  verifyFirebaseCaller,
} from './_security';

ensureFirebaseAdmin();

export default async function handler(req: any, res: any) {
  applySecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const caller = await verifyFirebaseCaller(req);
  if (!caller) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(`notif:${caller.uid}:${ip}`, 40, 60_000)) {
    return res.status(429).json({ error: 'Too many notification requests' });
  }

  const { token, title, body, data } = req.body || {};

  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ error: 'Valid FCM token is required' });
  }

  try {
    const stringData: Record<string, string> = {};
    if (data && typeof data === 'object') {
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined && val !== null) {
          const strVal = typeof val === 'string' ? val : String(val);
          if (key === 'sender_avatar' && (strVal.startsWith('data:') || strVal.length > 512)) {
            continue;
          }
          stringData[key] = strVal.slice(0, 1000);
        }
      }
    }

    if (stringData.sender_id && stringData.sender_id !== caller.uid) {
      return res.status(403).json({ error: 'Sender identity mismatch' });
    }
    if (!stringData.sender_id) {
      stringData.sender_id = caller.uid;
    }

    const notifTitle = String(title || stringData.title || 'New Notification').slice(0, 120);
    const notifBody = String(body || stringData.body || '').slice(0, 300);
    const fallbackRoute = stringData.sender_id ? `/messages?user=${encodeURIComponent(stringData.sender_id)}` : '/messages';
    const safeRelativeUrl = sanitizeInternalAppUrl(stringData.url, fallbackRoute);

    stringData.url = safeRelativeUrl;
    stringData.title = notifTitle;
    stringData.body = notifBody;

    const reqOrigin =
      typeof req.headers?.origin === 'string' && req.headers.origin.startsWith('https://')
        ? req.headers.origin
        : 'https://next-nexto.vercel.app';
    const absoluteHttpsLink = `${reqOrigin}${safeRelativeUrl}`;

    const safeIcon =
      stringData.sender_avatar && stringData.sender_avatar.startsWith('https://')
        ? stringData.sender_avatar
        : '/favicon.ico';

    const response = await admin.messaging().send({
      token,
      notification: {
        title: notifTitle,
        body: notifBody,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          title: notifTitle,
          body: notifBody,
          sound: 'default',
          priority: 'max',
          channelId: 'high_importance_channel',
          defaultSound: true,
          defaultVibrateTimings: true,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: notifTitle,
          body: notifBody,
          requireInteraction: true,
          icon: safeIcon,
          badge: '/favicon.ico',
          tag: stringData.chat_id || stringData.sender_id || 'next_notification',
          renotify: true,
          data: stringData,
        },
        fcmOptions: {
          link: absoluteHttpsLink,
        },
      },
    });
    res.status(200).json({ success: true, messageId: response });
  } catch (error: any) {
    const isNotRegistered =
      error?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/invalid-registration-token' ||
      (typeof error?.message === 'string' &&
        (error.message.includes('NotRegistered') ||
          error.message.includes('registration-token-not-registered') ||
          error.message.includes('invalid-registration-token')));

    if (isNotRegistered) {
      return res.status(200).json({ success: false, notRegistered: true, message: 'FCM token not registered or expired' });
    }
    console.error('Error sending message:', error?.message || error);
    res.status(200).json({ success: false, error: 'Failed to send notification' });
  }
}
