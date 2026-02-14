/**
 * Push notifications via Firebase Cloud Messaging (FCM).
 * Works for Android, iOS, Web (Chrome/Firefox/Edge on Windows/Mac), and desktop.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON (base64 or raw JSON string) or path in GOOGLE_APPLICATION_CREDENTIALS.
 */

import admin from 'firebase-admin';
import DeviceToken from '../models/DeviceToken.js';

let messaging = null;

function getMessaging() {
  if (messaging) return messaging;
  const cred = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!cred && !path) {
    console.warn('Push: FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS not set; push disabled.');
    return null;
  }
  try {
    if (admin.apps.length === 0) {
      if (cred) {
        let json;
        try {
          json = JSON.parse(Buffer.from(cred, 'base64').toString('utf8'));
        } catch {
          json = JSON.parse(cred);
        }
        admin.initializeApp({ credential: admin.credential.cert(json) });
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
    }
    messaging = admin.messaging();
  } catch (err) {
    console.error('Push: Firebase init failed:', err.message);
    return null;
  }
  return messaging;
}

/**
 * Send push notification to all devices of a user.
 * @param {string|ObjectId} userId - Recipient user ID
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPushToUser(userId, payload) {
  const tokens = await DeviceToken.find({ userId }).select('token').lean();
  if (!tokens?.length) return { sent: 0, failed: 0 };

  const fcm = getMessaging();
  if (!fcm) return { sent: 0, failed: tokens.length };

  const tokenList = tokens.map((t) => t.token);
  const message = {
    notification: {
      title: payload.title || 'ProWorkers',
      body: payload.body || '',
    },
    data: payload.data
      ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)]))
      : undefined,
    tokens: tokenList,
  };

  let sent = 0;
  let failed = 0;
  try {
    const res = await fcm.sendEachForMulticast(message);
    sent = res.successCount;
    failed = res.failureCount;
    res.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/invalid-registration-token') {
        DeviceToken.deleteOne({ token: tokenList[i] }).catch(() => {});
      }
    });
  } catch (err) {
    console.error('Push send error:', err.message);
    failed = tokenList.length;
  }
  return { sent, failed };
}
