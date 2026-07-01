function safeUser(user: any) {
  if (!user) return user;
  const {
    password,
    resetPasswordToken,
    confirmationToken,
    sessionVersion,
    ...rest
  } = user;
  return rest;
}

type KeycloakPasswordUpdateResult = {
  ok: boolean;
  message?: string;
};

function normalizedSessionVersion(value: any): number {
  const version = Number(value);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

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
  return value ? `${value}@bpm.local` : '';
}

function cleanString(value: any): string {
  return String(value ?? '').trim();
}

function normalizeText(value: any): string {
  return cleanString(value).toLocaleLowerCase('ru');
}

function primaryWorkplace(workplaces: any[]) {
  return (
    workplaces.find((workplace) => workplace?.primary === true) ||
    workplaces[0] ||
    null
  );
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e',
    ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', қ: 'k', л: 'l', м: 'm',
    н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'c', ч: 'ch',
    ш: 'sh', щ: 'sh', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya',
    ъ: '', ь: '',
  };

  return Array.from(cleanString(value).toLocaleLowerCase('ru'))
    .map((char) => map[char] ?? char)
    .join('');
}

function departmentKeyFromName(departmentName: string): string {
  const fallback = Buffer.from(departmentName).toString('hex').slice(0, 8).toUpperCase();
  return (
    transliterate(departmentName)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 52) || `DEP_${fallback}`
  );
}

function namePartsFromEmployeeCard(card: any) {
  const fioParts = cleanString(card?.fio).split(/\s+/).filter(Boolean);
  const lastName = cleanString(card?.lastName) || fioParts[0] || cleanString(card?.iin);
  const firstName = cleanString(card?.firstName) || fioParts[1] || lastName;
  return { firstName, lastName };
}

async function ensureDepartmentForWorkplace(strapi: any, workplace: any) {
  const departmentName = cleanString(workplace?.department);
  if (!departmentName) return null;

  const departments = await strapi.db.query('api::department.department').findMany({
    select: ['id', 'key', 'name_ru', 'name_kz'],
  });
  const nameKey = normalizeText(departmentName);
  const existing = (departments || []).find((department: any) =>
    [department.key, department.name_ru, department.name_kz].some((value) => normalizeText(value) === nameKey)
  );
  if (existing?.id) return existing;

  const baseKey = cleanString(workplace?.departmentId)
    ? `ONEC_${cleanString(workplace.departmentId)}`
    : departmentKeyFromName(departmentName);
  let key = baseKey;
  let index = 1;
  const usedKeys = new Set((departments || []).map((department: any) => cleanString(department.key)).filter(Boolean));
  while (usedKeys.has(key)) {
    key = `${baseKey.slice(0, 48)}_${index}`;
    index += 1;
  }

  return await strapi.entityService.create('api::department.department', {
    data: {
      key,
      name_ru: departmentName,
      name_kz: departmentName,
    } as any,
  });
}

async function enrichEmployeeUserFromCard(strapi: any, user: any) {
  const username = cleanString(user?.username);
  if (user?.provider !== 'keycloak' || !/^\d{12}$/.test(username)) return user;

  const card = await strapi.db.query('api::employee-card.employee-card').findOne({
    where: { iin: username },
  });
  if (!card?.id) return user;

  const workplace = primaryWorkplace(Array.isArray(card.workplaces) ? card.workplaces : []);
  const { firstName, lastName } = namePartsFromEmployeeCard(card);
  const position = cleanString(workplace?.position);
  const department = await ensureDepartmentForWorkplace(strapi, workplace);

  const patch: Record<string, any> = {
    firstName,
    lastName,
    email: internalEmployeeEmail(username),
  };
  if (position) patch.position = position;
  if (department?.id) patch.department = department.id;

  const needsUpdate =
    cleanString(user.firstName) !== firstName ||
    cleanString(user.lastName) !== lastName ||
    cleanString(user.position) !== position ||
    cleanString(user.email) !== patch.email ||
    (department?.id && Number(user.department?.id || 0) !== Number(department.id));

  if (!needsUpdate) return user;

  return await strapi.entityService.update('plugin::users-permissions.user', user.id, {
    data: patch as any,
    populate: ['role', 'department'],
  });
}

async function bumpSessionVersion(strapi: any, userId: number): Promise<number> {
  const user = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    select: ['id', 'sessionVersion'],
  });
  const nextVersion = normalizedSessionVersion(user?.sessionVersion) + 1;

  await strapi.db.query('plugin::users-permissions.user').update({
    where: { id: userId },
    data: { sessionVersion: nextVersion },
  });

  const sessionManager = strapi.sessionManager;
  if (sessionManager?.hasOrigin?.('users-permissions')) {
    await sessionManager('users-permissions').invalidateRefreshToken(String(userId));
  }

  return nextVersion;
}

async function issueCurrentSessionJwt(strapi: any, userId: number, sessionVersion?: number) {
  let version = sessionVersion;
  if (version === undefined) {
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      select: ['id', 'sessionVersion'],
    });
    version = normalizedSessionVersion(user?.sessionVersion);
  }

  return strapi.plugin('users-permissions').service('jwt').issue({
    id: userId,
    sessionVersion: normalizedSessionVersion(version),
  });
}

async function refreshResponseJwt(strapi: any, ctx: any, userId?: number) {
  if (!ctx.body?.jwt) return;
  const resolvedUserId = Number(userId || ctx.body?.user?.id);
  if (!resolvedUserId) return;
  ctx.body.jwt = await issueCurrentSessionJwt(strapi, resolvedUserId);
}

async function getKeycloakAdminToken(strapi: any): Promise<string | null> {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const adminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
  const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!keycloakUrl || !adminClientSecret) return null;

  const res = await fetch(`${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: adminClientId,
      client_secret: adminClientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    strapi.log.warn(
      `[keycloak-profile] admin token failed: HTTP ${res.status}${text ? ` ${text.slice(0, 300)}` : ''}`
    );
    return null;
  }
  const data = await res.json() as any;
  return data?.access_token || null;
}

async function findKeycloakUser(strapi: any, token: string, user: any): Promise<any | null> {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  if (!keycloakUrl) return null;
  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;
  const headers = { Authorization: `Bearer ${token}` };

  const username = String(user?.username || '').trim();
  if (username) {
    const byUsername = await fetch(`${adminBase}/users?username=${encodeURIComponent(username)}&exact=true`, { headers });
    if (byUsername.ok) {
      const items = await byUsername.json() as any[];
      if (Array.isArray(items) && items[0]) return items[0];
    }
  }

  const email = String(user?.email || '').trim();
  if (!email) return null;
  const byEmail = await fetch(`${adminBase}/users?email=${encodeURIComponent(email)}&exact=true`, { headers });
  if (!byEmail.ok) return null;
  const items = await byEmail.json() as any[];
  return Array.isArray(items) ? items[0] : null;
}

async function updateKeycloakProfile(strapi: any, user: any, patch: any) {
  const token = await getKeycloakAdminToken(strapi);
  if (!token) return;
  const keycloakUser = await findKeycloakUser(strapi, token, user);
  if (!keycloakUser?.id) return;
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;
  await fetch(`${adminBase}/users/${keycloakUser.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...keycloakUser,
      firstName: patch.firstName ?? keycloakUser.firstName,
      lastName: patch.lastName ?? keycloakUser.lastName,
      attributes: {
        ...(keycloakUser.attributes || {}),
        ...(patch.position !== undefined ? { position: [String(patch.position || '')] } : {}),
      },
    }),
  }).catch((e: any) => strapi.log.warn(`[keycloak-profile] update failed: ${e?.message || e}`));
}

async function setKeycloakPassword(strapi: any, user: any, password: string): Promise<KeycloakPasswordUpdateResult> {
  const token = await getKeycloakAdminToken(strapi);
  if (!token) return { ok: false, message: 'Keycloak admin token is not configured' };

  const keycloakUser = await findKeycloakUser(strapi, token, user);
  if (!keycloakUser?.id) {
    strapi.log.warn(`[keycloak-profile] password update failed: user not found (${user?.email || user?.username || user?.id})`);
    return { ok: false, message: 'Keycloak user not found' };
  }

  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;

  try {
    const res = await fetch(`${adminBase}/users/${keycloakUser.id}/reset-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'password',
        value: password,
        temporary: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      strapi.log.warn(
        `[keycloak-profile] password update failed for ${user?.email || user?.username || user?.id}: HTTP ${res.status}${text ? ` ${text.slice(0, 300)}` : ''}`
      );
      return { ok: false, message: `Keycloak password update failed (HTTP ${res.status})` };
    }

    return { ok: true };
  } catch (e: any) {
    strapi.log.warn(`[keycloak-profile] password update failed: ${e?.message || e}`);
    return { ok: false, message: 'Keycloak password update failed' };
  }
}

async function logoutKeycloakSessions(strapi: any, user: any) {
  const token = await getKeycloakAdminToken(strapi);
  if (!token) return;
  const keycloakUser = await findKeycloakUser(strapi, token, user);
  if (!keycloakUser?.id) return;

  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const res = await fetch(
    `${keycloakUrl}/admin/realms/${keycloakRealm}/users/${keycloakUser.id}/logout`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    strapi.log.warn(
      `[keycloak-profile] session logout failed for ${user?.email || user?.username || user?.id}: HTTP ${res.status}${text ? ` ${text.slice(0, 300)}` : ''}`
    );
  }
}

async function verifyKeycloakPassword(strapi: any, user: any, password: string): Promise<boolean | null> {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  if (!keycloakUrl || !clientId) return null;

  const params: any = {
    grant_type: 'password',
    client_id: clientId,
    username: user?.provider === 'keycloak' ? user?.username : (user?.email || user?.username),
    password,
  };
  if (process.env.KEYCLOAK_CLIENT_SECRET) {
    params.client_secret = process.env.KEYCLOAK_CLIENT_SECRET;
  }

  try {
    const res = await fetch(`${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    if (res.ok) return true;
    if (res.status === 400 || res.status === 401) {
      const errorBody = await res.json().catch(() => ({})) as any;
      if (errorBody?.error === 'invalid_grant') return false;
      return null;
    }
    return null;
  } catch (e: any) {
    strapi.log.warn(`[keycloak-profile] password verification failed: ${e?.message || e}`);
    return null;
  }
}

export default (plugin) => {
  const originalJwtService = plugin.services.jwt;
  plugin.services.jwt = (context) => {
    const service = originalJwtService(context);
    return {
      ...service,
      async verify(token: string) {
        const payload = await service.verify(token);
        const mode = context.strapi.config.get(
          'plugin::users-permissions.jwtManagement',
          'legacy-support'
        );
        if (mode === 'refresh') return payload;

        const userId = Number(payload?.id);
        if (!userId) throw new Error('Invalid token.');

        const user = await context.strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: userId },
          select: ['id', 'sessionVersion'],
        });
        if (
          !user ||
          normalizedSessionVersion(payload?.sessionVersion) !==
            normalizedSessionVersion(user.sessionVersion)
        ) {
          throw new Error('Invalid token.');
        }

        return payload;
      },
    };
  };

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

    // 3. Strapi users-permissions requires OAuth email. Employee accounts log in
    // with username/IIN only, so keep Keycloak email empty and synthesize a
    // local-only technical email for Strapi user lookup/creation.
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

  // Wrap the auth controller factory to override the callback method.
  // Strapi controllers are factory functions: (context) => ({ method1, method2, ... })
  // We must wrap the factory, not assign properties to it.
  const originalAuthController = plugin.controllers.auth;
  plugin.controllers.auth = (context) => {
    const original = typeof originalAuthController === 'function'
      ? originalAuthController(context)
      : originalAuthController;

    return {
      ...original,
      async changePassword(ctx) {
        const requestUser = ctx.state.user;
        if (!requestUser?.id) return ctx.unauthorized('Необходима авторизация');

        const body = ctx.request.body || {};
        const currentPassword = String(body.currentPassword || '');
        const password = String(body.password || '');
        const passwordConfirmation = String(body.passwordConfirmation || '');
        if (!currentPassword || !password || !passwordConfirmation) {
          return ctx.badRequest('Заполните текущий пароль и новый пароль');
        }
        if (password !== passwordConfirmation) {
          return ctx.badRequest('Новые пароли не совпадают');
        }
        if (password.length < 6) {
          return ctx.badRequest('Пароль должен быть минимум 6 символов');
        }

        const fullUser = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          requestUser.id,
          { populate: ['role', 'department'] }
        );

        if ((fullUser as any)?.provider === 'keycloak') {
          const verified = await verifyKeycloakPassword(strapi, fullUser, currentPassword);
          if (verified === false) return ctx.badRequest('Текущий пароль указан неверно');

          const userService = strapi.plugin('users-permissions').service('user');

          if (verified !== true) {
            const localUser = await strapi.db
              .query('plugin::users-permissions.user')
              .findOne({ where: { id: requestUser.id } });
            const validLocalPassword = localUser?.password
              ? await userService.validatePassword(currentPassword, localUser.password)
              : false;

            if (!validLocalPassword) {
              return ctx.badRequest('Текущий пароль указан неверно');
            }
          }

          const keycloakUpdated = await setKeycloakPassword(strapi, fullUser, password);
          if (!keycloakUpdated.ok) {
            return ctx.badRequest(`Не удалось изменить пароль в Keycloak: ${keycloakUpdated.message}`);
          }

          await userService.edit(requestUser.id, { password });
          const sessionVersion = await bumpSessionVersion(strapi, Number(requestUser.id));
          await logoutKeycloakSessions(strapi, fullUser).catch((error: any) => {
            strapi.log.warn(`[keycloak-profile] session logout failed: ${error?.message || error}`);
          });
          ctx.body = {
            ok: true,
            jwt: await issueCurrentSessionJwt(strapi, Number(requestUser.id), sessionVersion),
            user: safeUser(fullUser),
          };
          return;
        }

        await original.changePassword(ctx);
        const sessionVersion = await bumpSessionVersion(strapi, Number(requestUser.id));
        ctx.body.jwt = await issueCurrentSessionJwt(strapi, Number(requestUser.id), sessionVersion);
      },

      async resetPassword(ctx) {
        await original.resetPassword(ctx);
        const userId = Number(ctx.body?.user?.id);
        if (!userId) return;
        const sessionVersion = await bumpSessionVersion(strapi, userId);
        ctx.body.jwt = await issueCurrentSessionJwt(strapi, userId, sessionVersion);
      },

      async callback(ctx) {
        // Pre-link: if a synced local employee exists, connect it to Keycloak
        // before Strapi's OAuth callback creates or finds the user.
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
                  data: { provider: 'keycloak' },
                });
              }
            }
          } catch (e: any) {
            strapi.log.warn('[keycloak] Pre-link check failed:', e?.message);
          }
        }

        // Call original callback
        await original.callback(ctx);

        // Post-callback: assign Member role to new Keycloak users
        const body = ctx.body as any;
        const userId = body?.user?.id;
        if (ctx.params?.provider === 'keycloak' && userId) {
          let user = await strapi.entityService.findOne(
            'plugin::users-permissions.user',
            userId,
            { populate: ['role', 'department'] }
          );
          user = await enrichEmployeeUserFromCard(strapi, user);

          const role = (user as any)?.role;
          if (role?.type === 'authenticated') {
            const memberRole = await strapi.db
              .query('plugin::users-permissions.role')
              .findOne({ where: { name: 'Member' } });

            if (!memberRole) {
              strapi.log.warn('[keycloak] Member role not found — user keeps Authenticated role');
            } else {
              await strapi.entityService.update('plugin::users-permissions.user', userId, {
                data: { role: memberRole.id },
              });
              strapi.log.info(`[keycloak] User ${userId} assigned Member role on first SSO login`);
            }
          }
        }

        await refreshResponseJwt(strapi, ctx, Number(userId));
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
      async update(ctx) {
        const requestUser = ctx.state.user;
        if (!requestUser?.id) return ctx.unauthorized('Необходима авторизация');

        const targetId = Number(ctx.params?.id);
        if (!targetId) return ctx.badRequest('id обязателен');

        const fullUser = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          requestUser.id,
          { fields: ['id', 'isSuperAdmin'] } as any
        );
        const isSelf = Number(requestUser.id) === targetId;
        const isSuperAdmin = Boolean((fullUser as any)?.isSuperAdmin);
        if (!isSelf && !isSuperAdmin) {
          return ctx.forbidden('Можно редактировать только свой профиль');
        }

        const body = ctx.request.body || {};
        const patch: Record<string, any> = {};
        for (const field of ['firstName', 'lastName', 'position']) {
          if (Object.prototype.hasOwnProperty.call(body, field)) {
            patch[field] = String(body[field] || '').trim();
          }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'avatarFileId')) {
          const rawAvatarFileId = body.avatarFileId;
          if (rawAvatarFileId === null || rawAvatarFileId === '' || rawAvatarFileId === false) {
            patch.avatarFileId = null;
            patch.avatarUrl = '';
          } else {
            const avatarFileId = Number(rawAvatarFileId);
            if (!Number.isInteger(avatarFileId) || avatarFileId <= 0) {
              return ctx.badRequest('Некорректный файл фото');
            }

            const avatarFile = await strapi.db
              .query('plugin::upload.file')
              .findOne({ where: { id: avatarFileId } });
            if (!avatarFile?.id || !String(avatarFile.mime || '').startsWith('image/')) {
              return ctx.badRequest('Можно загрузить только изображение');
            }

            patch.avatarFileId = avatarFileId;
            patch.avatarUrl = avatarFile.url || '';
          }
        }
        if (Object.keys(patch).length === 0) {
          return ctx.badRequest('Нет данных для обновления');
        }

        const before = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          targetId,
          { fields: ['id', 'username', 'email', 'provider', 'firstName', 'lastName', 'position', 'avatarUrl', 'avatarFileId'] } as any
        );
        const updated = await strapi.entityService.update(
          'plugin::users-permissions.user',
          targetId,
          {
            data: patch,
            populate: ['role', 'department'],
          }
        );

        if ((before as any)?.provider === 'keycloak') {
          await updateKeycloakProfile(strapi, before, patch);
        }

        ctx.body = safeUser(updated);
      },

      async me(ctx) {
        await original.me(ctx);

        if (ctx.body && ctx.state.user) {
          let user = await strapi.entityService.findOne(
            'plugin::users-permissions.user',
            ctx.state.user.id,
            { populate: ['role', 'department'] }
          );

          if (user) {
            user = await enrichEmployeeUserFromCard(strapi, user);
            ctx.body = user;
          }
        }
      },
    };
  };

  return plugin;
};
