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

    // 2. Patch purest's hardcoded https:// for Keycloak
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
    } catch (e: any) {
      strapi.log.warn('[keycloak] Could not patch purest config:', e?.message);
    }
  };

  // Wrap the auth controller factory to override the callback method.
  const originalAuthController = plugin.controllers.auth;
  plugin.controllers.auth = (context) => {
    const original = typeof originalAuthController === 'function'
      ? originalAuthController(context)
      : originalAuthController;

    return {
      ...original,
      async callback(ctx) {
        // Pre-link: if a local user exists with same email, update provider to keycloak
        if (ctx.params?.provider === 'keycloak') {
          try {
            const token = ctx.query?.access_token as string;
            if (token) {
              const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
              const email = (payload.email || '').toLowerCase();

              if (email) {
                const existingUser = await strapi.db
                  .query('plugin::users-permissions.user')
                  .findOne({ where: { email } });

                if (existingUser && existingUser.provider !== 'keycloak') {
                  strapi.log.info(
                    `[keycloak] Pre-linking user ${existingUser.id} (${email}) from '${existingUser.provider}' to 'keycloak'`
                  );
                  await strapi.entityService.update('plugin::users-permissions.user', existingUser.id, {
                    data: { provider: 'keycloak' },
                  });
                }
              }
            }
          } catch (e: any) {
            strapi.log.warn('[keycloak] Pre-link check failed:', e?.message);
          }
        }

        // Call original callback
        await original.callback(ctx);

        // Post-callback: assign Member role to new Keycloak users
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
      },
    };
  };

  // Wrap the user controller factory to override the me method
  const originalUserController = plugin.controllers.user;
  plugin.controllers.user = (context) => {
    const original = typeof originalUserController === 'function'
      ? originalUserController(context)
      : originalUserController;

    return {
      ...original,
      async me(ctx) {
        await original.me(ctx);

        if (ctx.body && ctx.state.user) {
          const user = await strapi.entityService.findOne(
            'plugin::users-permissions.user',
            ctx.state.user.id,
            { populate: ['role', 'department'] }
          );

          if (user) {
            ctx.body = user;
          }
        }
      },
    };
  };

  return plugin;
};
