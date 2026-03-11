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
  };

  // Patch the connect service to handle "Email is already taken" by linking existing local user to Keycloak
  const originalConnect = plugin.services['providers'].connect;
  plugin.services['providers'].connect = async (provider, query) => {
    try {
      return await originalConnect(provider, query);
    } catch (error: any) {
      if (provider === 'keycloak' && error?.message?.includes('Email is already taken')) {
        // Decode email from Keycloak JWT access_token (base64 payload)
        let userEmail: string | undefined;
        try {
          const token = query?.access_token;
          if (token) {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            userEmail = (payload.email || '').toLowerCase();
          }
        } catch (e) {
          strapi.log.error('[keycloak] Failed to decode access_token JWT');
        }

        if (!userEmail) throw error;

        // Find existing user by email
        const existingUser = await strapi.db
          .query('plugin::users-permissions.user')
          .findOne({ where: { email: userEmail }, populate: ['role'] });

        if (!existingUser) throw error;

        strapi.log.info(`[keycloak] Linking existing user ${existingUser.id} (${userEmail}) to Keycloak provider`);

        // Update provider to keycloak so future logins work directly
        await strapi.entityService.update('plugin::users-permissions.user', existingUser.id, {
          data: { provider: 'keycloak' },
        });

        return existingUser;
      }
      throw error;
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
