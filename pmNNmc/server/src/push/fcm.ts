import admin from 'firebase-admin';

declare const strapi: any;

let app: admin.app.App | null = null;
let triedInit = false;

// Lazily init Firebase Admin from the FIREBASE_SERVICE_ACCOUNT env var
// (the service-account JSON, set on the server — NOT in git).
function getApp(): admin.app.App | null {
  if (app) return app;
  if (triedInit) return null;
  triedInit = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    strapi.log.warn('[push] FIREBASE_SERVICE_ACCOUNT not set — push disabled');
    return null;
  }
  try {
    // Accept raw JSON or base64-encoded JSON (base64 is safer as an env var).
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const creds = JSON.parse(text);
    app = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'push');
    strapi.log.info('[push] Firebase Admin initialized');
    return app;
  } catch (e: any) {
    strapi.log.error('[push] invalid FIREBASE_SERVICE_ACCOUNT: ' + (e?.message || e));
    return null;
  }
}

/** Send a push notification to all of a user's registered devices. Best-effort. */
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<void> {
  const a = getApp();
  if (!a || !userId) return;

  const rows = await strapi.db
    .query('api::device-token.device-token')
    .findMany({ where: { user: userId } });
  const tokens: string[] = rows.map((r: any) => r.token).filter(Boolean);
  if (!tokens.length) return;

  try {
    const res = await a.messaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: { priority: 'high' },
    });
    // Remove tokens FCM reports as permanently invalid.
    res.responses.forEach((r: any, i: number) => {
      const code = r.error?.code || '';
      if (!r.success && /not-registered|invalid-argument|invalid-registration/i.test(code)) {
        strapi.db
          .query('api::device-token.device-token')
          .delete({ where: { token: tokens[i] } })
          .catch(() => {});
      }
    });
  } catch (e: any) {
    strapi.log.warn('[push] send failed: ' + (e?.message || e));
  }
}
