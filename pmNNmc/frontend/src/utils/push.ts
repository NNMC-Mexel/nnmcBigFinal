import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import client from '../api/client';

let started = false;

/**
 * Register the device for push notifications (native only) and send the FCM
 * token to the backend. Best-effort — never throws to the caller.
 * Called after the user is authenticated (see AppLayout).
 */
export async function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      started = false;
      return;
    }

    await PushNotifications.addListener('registration', async (token) => {
      console.log('[push] FCM token:', token.value);
      try {
        await client.post('/device-tokens/register', {
          token: token.value,
          platform: Capacitor.getPlatform(),
        });
      } catch {
        // Backend endpoint may not be ready yet; the token re-registers next launch.
      }
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] setup failed', e);
    started = false;
  }
}
