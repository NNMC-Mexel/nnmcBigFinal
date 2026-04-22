import type { Context } from 'koa';
import { getUserAccess } from '../../../utils/access';

declare const strapi: any;

function normalizeDepartments(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((d) => String(d || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [];
}

let lastUserSyncAt = 0;
const USER_SYNC_TTL_MS = 30_000;

async function syncUsersFromPmOnDemand() {
  if (Date.now() - lastUserSyncAt < USER_SYNC_TTL_MS) return;
  lastUserSyncAt = Date.now();
  const pmUrl = process.env.SERVER_PM_URL;
  if (!pmUrl) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `${pmUrl}/api/users?pagination[pageSize]=500`,
      { signal: ctrl.signal }
    ).finally(() => clearTimeout(t));
    if (!res.ok) return;
    const items: any[] = (await res.json()) as any[];
    if (!Array.isArray(items) || items.length === 0) return;
    const authRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });
    if (!authRole) return;
    for (const pmUser of items) {
      const email = String(pmUser?.email || '').toLowerCase().trim();
      if (!email) continue;
      const username = String(pmUser?.username || email).trim();
      const existing = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email } });
      if (!existing) {
        try {
          await (strapi.entityService as any).create('plugin::users-permissions.user', {
            data: {
              username,
              email,
              provider: 'keycloak',
              password: `kc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
              confirmed: true,
              blocked: false,
              role: authRole.id,
              allowedDepartments: [],
            },
          });
        } catch {}
      }
    }
  } catch {}
}

export default {
  // GET /api/department-access/users
  async listUsers(ctx: Context) {
    const access = await getUserAccess(ctx);
    if (!access.isAdmin) {
      ctx.throw(403, 'Нет доступа');
    }

    await syncUsersFromPmOnDemand();

    const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
      populate: ['role'],
      fields: ['id', 'username', 'email', 'allowedDepartments'],
      pagination: { pageSize: 1000 },
    });

    const items = (users || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role?.name || u.role?.type || '',
      allowedDepartments: Array.isArray(u.allowedDepartments) ? u.allowedDepartments : [],
    }));

    ctx.body = { items };
  },

  // POST /api/department-access/update
  async updateUser(ctx: Context) {
    const access = await getUserAccess(ctx);
    if (!access.isAdmin) {
      ctx.throw(403, 'Нет доступа');
    }

    const body: any = ctx.request.body || {};
    const idRaw = body.userId || body.id;
    const userId = parseInt(String(idRaw), 10);
    if (!userId || Number.isNaN(userId)) {
      ctx.throw(400, 'userId обязателен');
    }

    const departments = normalizeDepartments(
      body.departments !== undefined ? body.departments : body.allowedDepartments
    );

    const updated = await strapi.entityService.update(
      'plugin::users-permissions.user',
      userId,
      {
        data: {
          allowedDepartments: departments,
        },
      }
    );

    ctx.body = {
      item: {
        id: updated.id,
        allowedDepartments: updated.allowedDepartments || [],
      },
    };
  },
};
