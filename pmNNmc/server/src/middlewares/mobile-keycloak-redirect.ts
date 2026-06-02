/**
 * mobile-keycloak-redirect
 *
 * Когда SSO-вход начат из мобильного приложения (Capacitor) —
 * запрос `/api/connect/keycloak?mobile=1` — переписывает финальный редирект
 * Strapi на deep link приложения, чтобы токен вернулся в app, а не на веб-фронт.
 *
 * Поток: app открывает /api/connect/keycloak?mobile=1 во встроенном браузере
 *   -> мы ставим cookie kc_mobile=1 (5 мин)
 *   -> Keycloak-вход -> Strapi отдаёт 30x на /connect/keycloak/redirect?access_token=...
 *   -> мы видим cookie и подменяем Location на kz.nnmc.webportal://connect/keycloak/redirect?...
 *   -> ОС открывает приложение (DeepLinkHandler на фронте ловит и логинит).
 *
 * На веб-вход (без mobile=1 / без cookie) не влияет.
 */
const APP_SCHEME = 'kz.nnmc.webportal';
const COOKIE = 'kc_mobile';
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

export default (_config: unknown, { strapi: _strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    // 1. Помечаем поток как мобильный в момент старта.
    if (ctx.path === '/api/connect/keycloak' && ctx.query?.mobile === '1') {
      ctx.cookies.set(COOKIE, '1', {
        httpOnly: true,
        maxAge: 5 * 60 * 1000,
        sameSite: 'lax',
        overwrite: true,
      });
    }

    await next();

    // 2. После входа переписываем редирект на deep link приложения.
    const location = ctx.response.get('Location');
    if (
      REDIRECT_STATUSES.includes(ctx.status) &&
      location &&
      location.includes('/connect/keycloak/redirect') &&
      ctx.cookies.get(COOKIE) === '1'
    ) {
      const q = location.indexOf('?');
      const query = q >= 0 ? location.slice(q) : '';
      ctx.cookies.set(COOKIE, null); // очистить флаг
      ctx.set('Location', `${APP_SCHEME}://connect/keycloak/redirect${query}`);
    }
  };
};
