export default (plugin) => {
  // Override bootstrap to patch Keycloak grant URLs to use HTTP instead of
  // grant's hardcoded https:// scheme (needed for internal HTTP-only deployments)
  const originalBootstrap = plugin.bootstrap;
  plugin.bootstrap = async ({ strapi }) => {
    await originalBootstrap({ strapi });

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
    if (!keycloakUrl) return;

    // 1. Patch grant config URLs in DB (for OAuth redirect flow)
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const grantConfig = (await pluginStore.get({ key: 'grant' })) as Record<string, any> | null;
    if (grantConfig?.keycloak) {
      const base = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect`;
      const keycloakHost = new URL(keycloakUrl).host;
      grantConfig.keycloak.subdomain    = `${keycloakHost}/realms/${keycloakRealm}`;
      grantConfig.keycloak.authorize_url = `${base}/auth`;
      grantConfig.keycloak.access_url   = `${base}/token`;
      grantConfig.keycloak.profile_url   = `${base}/userinfo`;
      await pluginStore.set({ key: 'grant', value: grantConfig });
      strapi.log.info(`[keycloak] grant config patched: subdomain=${grantConfig.keycloak.subdomain}`);
    }

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
  };

  // Assign "Member" role to new Keycloak users on first SSO login.
  // Users who already have a custom role (Lead, Admin, etc.) are not affected.
  const originalCallback = plugin.controllers.auth.callback;
  plugin.controllers.auth.callback = async (ctx) => {
    await originalCallback(ctx);

    if (ctx.params?.provider !== 'keycloak') return;

    const body = ctx.body as any;
    const userId = body?.user?.id;
    if (!userId) return;

    const user = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      userId,
      { populate: ['role'] }
    );

    const role = (user as any)?.role;
    // Only reassign if still on the default "Authenticated" role
    if (!role || role.type !== 'authenticated') return;

    const memberRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { name: 'Member' } });

    if (!memberRole) {
      strapi.log.warn('[keycloak] Member role not found — user keeps Authenticated role');
      return;
    }

    await strapi.entityService.update('plugin::users-permissions.user', userId, {
      data: { role: memberRole.id },
    });

    strapi.log.info(`[keycloak] User ${userId} assigned Member role on first SSO login`);
  };

  // Extend the me controller to include role
  const originalMe = plugin.controllers.user.me;

  plugin.controllers.user.me = async (ctx) => {
    // Call original me
    await originalMe(ctx);

    if (ctx.body && ctx.state.user) {
      // Fetch user with role populated
      const user = await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        ctx.state.user.id,
        {
          populate: ['role', 'department'],
        }
      );

      if (user) {
        ctx.body = user;
      }
    }
  };

  return plugin;
};
