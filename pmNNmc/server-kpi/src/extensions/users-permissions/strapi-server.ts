function decodeJwtPayload(token?: string): Record<string, any> {
  const payload = token?.split('.')[1];
  if (!payload) return {};

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function keycloakUsernameFromPayload(payload: any): string {
  return String(payload?.preferred_username || payload?.username || payload?.sub || '').trim();
}

function internalEmployeeEmail(username: any): string {
  const value = String(username || '').trim().toLowerCase();
  return value ? `${value}@nnmc.local` : '';
}

export default (plugin) => {
  // Override bootstrap to patch Keycloak grant URLs to use HTTP instead of
  // grant's hardcoded https:// scheme (needed for internal HTTP-only deployments)
  const originalBootstrap = plugin.bootstrap;
  plugin.bootstrap = async ({ strapi }) => {
    await originalBootstrap({ strapi });

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
    if (!keycloakUrl) return;

    // 1. Patch grant config URLs in DB (for OAuth redirect flow).
    // Also creates the keycloak entry if it doesn't exist yet (e.g. first deploy).
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const grantConfig = ((await pluginStore.get({ key: 'grant' })) || {}) as Record<string, any>;
    const base = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect`;
    const keycloakHost = new URL(keycloakUrl).host;
    grantConfig.keycloak = {
      ...(grantConfig.keycloak || {}),
      enabled:       process.env.KEYCLOAK_ENABLED === 'true',
      key:           process.env.KEYCLOAK_CLIENT_ID || '',
      secret:        process.env.KEYCLOAK_CLIENT_SECRET || '',
      subdomain:     `${keycloakHost}/realms/${keycloakRealm}`,
      authorize_url: `${base}/auth`,
      access_url:    `${base}/token`,
      profile_url:   `${base}/userinfo`,
      scope:         ['openid', 'profile', 'email'],
    };
    await pluginStore.set({ key: 'grant', value: grantConfig });
    strapi.log.info(`[keycloak] grant config upserted: subdomain=${grantConfig.keycloak.subdomain}`);

    // 2. Patch purest's hardcoded https:// for Keycloak (used in /api/auth/keycloak/callback).
    // purest/config/providers.json has "origin": "https://{subdomain}" hardcoded for Keycloak.
    // Modifying the cached module object makes all subsequent purest calls use HTTP.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const purestProviders = require('purest/config/providers');
      if (purestProviders.keycloak) {
        if (purestProviders.keycloak.default) {
          purestProviders.keycloak.default.origin = 'http://{subdomain}';
        }
        if (purestProviders.keycloak.oauth) {
          purestProviders.keycloak.oauth.origin = 'http://{subdomain}';
        }
        strapi.log.info('[keycloak] purest config patched to use HTTP');
      }
    } catch (e: any) {
      strapi.log.warn('[keycloak] Could not patch purest config:', e?.message);
    }

    // 3. Strapi requires OAuth email. Employee Keycloak accounts can be
    // username-only, so synthesize a local technical email for Strapi only.
    try {
      const providersRegistry = strapi
        .plugin('users-permissions')
        .service('providers-registry') as any;

      if (providersRegistry?.run && !providersRegistry.__nnmcKeycloakEmailPatch) {
        const originalRun = providersRegistry.run.bind(providersRegistry);

        providersRegistry.run = async (args: any) => {
          const profile = await originalRun(args);
          if (args?.provider !== 'keycloak') return profile;

          const username = String(profile?.username || '').trim();
          if (profile?.email || !username) return profile;

          return {
            ...profile,
            email: internalEmployeeEmail(username),
          };
        };

        providersRegistry.__nnmcKeycloakEmailPatch = true;
        strapi.log.info('[keycloak] provider email fallback enabled for username-only users');
      }
    } catch (e: any) {
      strapi.log.warn('[keycloak] Could not patch provider email fallback:', e?.message);
    }
  };

  const originalAuthController = plugin.controllers.auth;
  plugin.controllers.auth = (context) => {
    const original = typeof originalAuthController === 'function'
      ? originalAuthController(context)
      : originalAuthController;

    return {
      ...original,
      async callback(ctx) {
        if (ctx.params?.provider === 'keycloak') {
          try {
            const token = ctx.query?.access_token as string;
            if (token) {
              const payload = decodeJwtPayload(token);
              const username = keycloakUsernameFromPayload(payload);
              const email = String(payload.email || '').trim().toLowerCase();
              const lookupEmail = email || internalEmployeeEmail(username);

              const existingByUsername = username
                ? await strapi.db
                  .query('plugin::users-permissions.user')
                  .findOne({ where: { username } })
                : null;

              const existingByEmail = !existingByUsername && lookupEmail
                ? await strapi.db
                  .query('plugin::users-permissions.user')
                  .findOne({ where: { email: lookupEmail } })
                : null;

              const existingUser = existingByUsername || existingByEmail;

              if (existingUser && existingUser.provider !== 'keycloak') {
                strapi.log.info(
                  `[keycloak] Pre-linking user ${existingUser.id} (${username || lookupEmail}) from '${existingUser.provider}' to 'keycloak'`
                );
                await strapi.entityService.update('plugin::users-permissions.user', existingUser.id, {
                  data: { provider: 'keycloak' } as any,
                });
              }
            }
          } catch (e: any) {
            strapi.log.warn('[keycloak] Pre-link check failed:', e?.message);
          }
        }

        await original.callback(ctx);
      },
    };
  };

  return plugin;
};
