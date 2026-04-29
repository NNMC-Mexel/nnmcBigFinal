import type { Context } from 'koa';

declare const strapi: any;

function isAuthorizedInternal(ctx: Context): boolean {
  const secret = process.env.INTERNAL_SYNC_TOKEN;
  if (!secret) return false;
  const provided = String(
    ctx.request.headers['x-internal-token'] ||
      ctx.request.headers['X-Internal-Token'] ||
      ''
  ).trim();
  return provided === secret;
}

async function findUserByEmail(email: string) {
  if (!email) return null;
  return await strapi.db
    .query('plugin::users-permissions.user')
    .findOne({ where: { email: email.toLowerCase() } });
}

export default {
  // GET /api/notifications/mine?unread=1&limit=50
  async mine(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const unreadOnly = String(ctx.query.unread || '') === '1';
    const limit = Math.min(Number(ctx.query.limit) || 50, 200);

    const filters: any = { recipient: user.id };
    if (unreadOnly) filters.isRead = false;

    const items = await strapi.entityService.findMany('api::notification.notification', {
      filters,
      sort: { createdAt: 'desc' },
      pagination: { pageSize: limit },
    });

    ctx.body = { items: items || [] };
  },

  // GET /api/notifications/unread-count
  async unreadCount(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const count = await strapi.db.query('api::notification.notification').count({
      where: { recipient: user.id, isRead: false },
    });

    ctx.body = { count };
  },

  // POST /api/notifications/:id/read
  async markRead(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const idRaw = ctx.params.id;
    const id = parseInt(String(idRaw), 10);
    if (!id) return ctx.badRequest('id обязателен');

    const existing = await strapi.db
      .query('api::notification.notification')
      .findOne({ where: { id }, populate: ['recipient'] });

    if (!existing) return ctx.notFound('Не найдено');
    if (existing.recipient?.id !== user.id) return ctx.forbidden('Нет доступа');

    await strapi.entityService.update('api::notification.notification', id, {
      data: { isRead: true },
    });

    ctx.body = { ok: true };
  },

  // POST /api/notifications/mark-all-read
  async markAllRead(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    await strapi.db.query('api::notification.notification').updateMany({
      where: { recipient: user.id, isRead: false },
      data: { isRead: true },
    });

    ctx.body = { ok: true };
  },

  // POST /api/internal-notifications
  // Body: { recipientEmail, title, body?, type?, link?, metadata? }
  // Used by other services to push a notification to a user.
  // Auth: X-Internal-Token header.
  async createInternal(ctx: Context) {
    if (!isAuthorizedInternal(ctx)) {
      ctx.status = 403;
      ctx.body = { error: 'forbidden' };
      return;
    }

    const body: any = ctx.request.body || {};
    const recipientEmail = String(body.recipientEmail || '').trim();
    const title = String(body.title || '').trim();
    if (!recipientEmail || !title) {
      ctx.status = 400;
      ctx.body = { error: 'recipientEmail and title required' };
      return;
    }

    const user = await findUserByEmail(recipientEmail);
    if (!user) {
      ctx.status = 404;
      ctx.body = { error: 'recipient not found' };
      return;
    }

    const created = await strapi.entityService.create('api::notification.notification', {
      data: {
        recipient: user.id,
        title,
        body: body.body || '',
        type: body.type || 'info',
        link: body.link || '',
        isRead: false,
        metadata: body.metadata || null,
      },
    });

    ctx.body = { id: created.id };
  },
};
