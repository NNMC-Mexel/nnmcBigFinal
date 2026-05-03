import type { Context } from 'koa';

declare const strapi: any;

// Shared secret for inter-service calls (set via env var on all 3 servers).
function isAuthorized(ctx: Context): boolean {
  const secret = process.env.INTERNAL_SYNC_TOKEN;
  if (!secret) return false; // env var unset → endpoint locked
  const provided = String(
    ctx.request.headers['x-internal-token'] ||
      ctx.request.headers['X-Internal-Token'] ||
      ''
  ).trim();
  return provided === secret;
}

export default {
  // GET /api/internal-sync/users
  // Returns users with the fields needed for server-kpi/server-signdoc sync.
  // Requires X-Internal-Token header matching INTERNAL_SYNC_TOKEN env var.
  async users(ctx: Context) {
    if (!isAuthorized(ctx)) {
      ctx.status = 403;
      ctx.body = { error: 'forbidden' };
      return;
    }
    const users = await strapi.entityService.findMany(
      'plugin::users-permissions.user',
      {
        populate: ['department'],
        fields: [
          'id',
          'username',
          'email',
          'firstName',
          'lastName',
          'position',
          'avatarUrl',
          'avatarFileId',
          'isSuperAdmin',
          'isKpiResponsible',
        ],
        pagination: { pageSize: 1000 },
      }
    );
    const items = (users || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      position: u.position,
      avatarUrl: u.avatarUrl,
      avatarFileId: u.avatarFileId,
      fullName: [u.lastName, u.firstName].filter(Boolean).join(' '),
      isSuperAdmin: Boolean(u.isSuperAdmin),
      isKpiResponsible: Boolean(u.isKpiResponsible),
      department: u.department
        ? {
            id: u.department.id,
            key: u.department.key,
            name_ru: u.department.name_ru,
            name_kz: u.department.name_kz,
          }
        : null,
    }));
    ctx.body = items;
  },

  // GET /api/internal-sync/departments
  async departments(ctx: Context) {
    if (!isAuthorized(ctx)) {
      ctx.status = 403;
      ctx.body = { error: 'forbidden' };
      return;
    }
    const list = await strapi.entityService.findMany('api::department.department', {
      fields: ['id', 'key', 'name_ru', 'name_kz', 'canViewKpiTimesheet'],
      pagination: { pageSize: 1000 },
    });
    const items = (list || []).map((d: any) => ({
      id: d.id,
      key: d.key,
      name_ru: d.name_ru,
      name_kz: d.name_kz,
      canViewKpiTimesheet: Boolean(d.canViewKpiTimesheet),
    }));
    ctx.body = items;
  },
};
