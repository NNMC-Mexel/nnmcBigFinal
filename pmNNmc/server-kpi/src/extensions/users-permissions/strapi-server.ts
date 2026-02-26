export default (plugin) => {
  // Override bootstrap to patch Keycloak grant URLs to use HTTP instead of
  // grant's hardcoded https:// scheme (needed for internal HTTP-only deployments)
  const originalBootstrap = plugin.bootstrap;
  plugin.bootstrap = async ({ strapi }) => {
    await originalBootstrap({ strapi });

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
    if (!keycloakUrl) return;

    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const grantConfig = (await pluginStore.get({ key: 'grant' })) as Record<string, any> | null;
    if (!grantConfig?.keycloak) return;

    const base = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect`;
    grantConfig.keycloak.authorize_url = `${base}/auth`;
    grantConfig.keycloak.access_url   = `${base}/token`;
    await pluginStore.set({ key: 'grant', value: grantConfig });
    strapi.log.info(`[keycloak] grant URLs set to ${keycloakUrl}`);
  };

  return plugin;
};
