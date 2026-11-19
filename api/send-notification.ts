import admin from 'firebase-admin';

if (!admin.apps.length) {
    let serviceAccount;
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountVar) {
        try {
            serviceAccount = JSON.parse(serviceAccountVar);
        } catch (e) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e);
        }
    }
    
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        admin.initializeApp();
    }
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token, title, body, data } = req.body || {};

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'FCM token is required' });
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

        const notifTitle = String(title || stringData.title || 'New Notification');
        const notifBody = String(body || stringData.body || '');
        const rawTargetUrl = stringData.url || (stringData.sender_id ? `/messages?user=${stringData.sender_id}` : '/messages');
        const relativeTarget = rawTargetUrl.startsWith('/') ? rawTargetUrl : `/${rawTargetUrl}`;
        stringData.url = rawTargetUrl.startsWith('http') ? rawTargetUrl : relativeTarget;
        stringData.title = notifTitle;
        stringData.body = notifBody;

        const reqOrigin = typeof req.headers?.origin === 'string' && req.headers.origin.startsWith('https://')
            ? req.headers.origin
            : 'https://next-nexto.vercel.app';
        const absoluteHttpsLink = rawTargetUrl.startsWith('https://')
            ? rawTargetUrl
            : `${reqOrigin}${relativeTarget}`;

        const safeIcon = (stringData.sender_avatar && stringData.sender_avatar.startsWith('https://'))
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
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                }
            },
            webpush: {
                headers: {
                    Urgency: 'high'
                },
                notification: {
                    title: notifTitle,
                    body: notifBody,
                    requireInteraction: true,
                    icon: safeIcon,
                    badge: '/favicon.ico',
                    tag: stringData.chat_id || stringData.sender_id || 'next_notification',
                    renotify: true,
                    data: stringData
                },
                fcmOptions: {
                    link: absoluteHttpsLink
                }
            }
        });
        res.status(200).json({ success: true, messageId: response });
    } catch (error: any) {
        const isNotRegistered =
            error?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/invalid-registration-token' ||
            (typeof error?.message === 'string' && (
                error.message.includes('NotRegistered') ||
                error.message.includes('registration-token-not-registered') ||
                error.message.includes('invalid-registration-token')
            ));

        if (isNotRegistered) {
            return res.status(200).json({ success: false, notRegistered: true, message: 'FCM token not registered or expired' });
        }
        console.error('Error sending message:', error);
        res.status(200).json({ success: false, error: error?.message || 'Failed to send notification' });
    }
}
