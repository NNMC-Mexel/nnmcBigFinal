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
  };

  return plugin;
};
