import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { KEYCLOAK_REDIRECT_EVENT } from '../utils/keycloakAuth';

/**
 * Finishes the native Keycloak login inside the SPA.
 *
 * Primary path: the in-app WebView (see startKeycloakLogin) captures the
 * `…/connect/keycloak/redirect?…` URL and dispatches `KEYCLOAK_REDIRECT_EVENT`
 * with the query string. We route the SPA to the existing KeycloakCallbackPage,
 * which exchanges the tokens with all backends.
 *
 * Fallback path: a `kz.nnmc.webportal://` deep link (custom URL scheme) via
 * `appUrlOpen`, kept for safety.
 *
 * No-op on web.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const goToCallback = (search: string) => {
      navigate(`/connect/keycloak/redirect${search}`, { replace: true });
    };

    // Primary: in-app WebView captured the redirect.
    const onRedirect = (e: Event) => {
      const search = (e as CustomEvent<string>).detail ?? '';
      goToCallback(search);
    };
    window.addEventListener(KEYCLOAK_REDIRECT_EVENT, onRedirect);

    // Fallback: custom-scheme deep link.
    const appHandle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.includes('connect/keycloak/redirect')) return;
      const q = url.indexOf('?');
      goToCallback(q >= 0 ? url.slice(q) : '');
    });

    return () => {
      window.removeEventListener(KEYCLOAK_REDIRECT_EVENT, onRedirect);
      appHandle.then((h) => h.remove()).catch(() => {});
    };
  }, [navigate]);

  return null;
}
