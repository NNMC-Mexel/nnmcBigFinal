function decodeJwtPayload(token) {
  const payload = token?.split('.')[1];
  if (!payload) return {};

  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function keycloakUsernameFromPayload(payload) {
  return String(payload?.preferred_username || payload?.username || payload?.sub || '').trim();
}

function internalEmployeeEmail(username) {
  const value = String(username || '').trim().toLowerCase();
  return value ? `${value}@nnmc.local` : '';
}

module.exports = (plugin) => {
  const originalBootstrap = plugin.bootstrap;
  plugin.bootstrap = async ({ strapi }) => {
    await originalBootstrap({ strapi });

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
    if (!keycloakUrl) return;

    // Upsert grant config for Keycloak
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const grantConfig = (await pluginStore.get({ key: 'grant' })) || {};
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

    // Patch purest to use HTTP instead of HTTPS
    try {
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
    } catch (e) {
      strapi.log.warn('[keycloak] Could not patch purest config:', e?.message);
    }

    try {
      const providersRegistry = strapi
        .plugin('users-permissions')
        .service('providers-registry');

      if (providersRegistry?.run && !providersRegistry.__nnmcKeycloakEmailPatch) {
        const originalRun = providersRegistry.run.bind(providersRegistry);

        providersRegistry.run = async (args) => {
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
    } catch (e) {
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
            const token = ctx.query?.access_token;
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
                  data: { provider: 'keycloak' },
                });
              }
            }
          } catch (e) {
            strapi.log.warn('[keycloak] Pre-link check failed:', e?.message);
          }
        }

        await original.callback(ctx);
      },
    };
  };

  return plugin;
};
