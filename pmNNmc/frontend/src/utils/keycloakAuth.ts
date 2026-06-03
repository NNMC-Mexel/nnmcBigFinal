import { Capacitor } from '@capacitor/core';
import { InAppBrowser, DefaultWebViewOptions } from '@capacitor/inappbrowser';

// Window event the DeepLinkHandler listens for to finish login inside the SPA.
export const KEYCLOAK_REDIRECT_EVENT = 'nnmc:keycloak-redirect';

/**
 * Start Keycloak SSO login.
 * - Web: full-page redirect to the Strapi connect endpoint (unchanged).
 * - Native (Capacitor): open Keycloak in an in-app WebView (NO external browser,
 *   no address bar). When the flow redirects to `…/connect/keycloak/redirect?…`,
 *   capture the tokens from the URL, close the WebView, and hand the query to the
 *   existing KeycloakCallbackPage via a window event.
 */
export async function startKeycloakLogin(): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL;
  const connectUrl = `${apiUrl}/api/connect/keycloak`;

  if (!Capacitor.isNativePlatform()) {
    window.location.href = connectUrl;
    return;
  }

  let handled = false;
  let navHandle: { remove: () => Promise<void> } | null = null;
  let closeHandle: { remove: () => Promise<void> } | null = null;

  const cleanup = async () => {
    await navHandle?.remove().catch(() => {});
    await closeHandle?.remove().catch(() => {});
    navHandle = null;
    closeHandle = null;
  };

  navHandle = await InAppBrowser.addListener('browserPageNavigationCompleted', async (data) => {
    const url = data?.url ?? '';
    if (handled || !url.includes('/connect/keycloak/redirect')) return;
    handled = true;
    const q = url.indexOf('?');
    const search = q >= 0 ? url.slice(q) : '';
    await InAppBrowser.close().catch(() => {});
    await cleanup();
    window.dispatchEvent(new CustomEvent(KEYCLOAK_REDIRECT_EVENT, { detail: search }));
  });

  closeHandle = await InAppBrowser.addListener('browserClosed', () => {
    // User dismissed the login window before finishing — just clean up listeners.
    if (!handled) void cleanup();
  });

  await InAppBrowser.openInWebView({
    url: connectUrl,
    options: {
      ...DefaultWebViewOptions,
      showURL: false, // no address bar
      showToolbar: false, // no top bar / "Закрыть" — full-screen, native feel
      showNavigationButtons: false,
      // Start each login fresh so logout is effective (Keycloak won't auto-SSO
      // from a lingering session cookie in the WebView).
      clearSessionCache: true,
    },
  });
}
