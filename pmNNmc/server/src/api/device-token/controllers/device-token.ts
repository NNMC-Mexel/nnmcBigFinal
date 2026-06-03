import { factories } from '@strapi/strapi';

declare const strapi: any;

export default factories.createCoreController('api::device-token.device-token' as any, () => ({
  // POST /api/device-tokens/register  { token, platform }
  async register(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const body = ctx.request?.body || {};
    const token = String(body.token || '').trim();
    const platform = String(body.platform || '').trim();
    if (!token) return ctx.badRequest('token required');

    const repo = strapi.db.query('api::device-token.device-token');
    const existing = await repo.findOne({ where: { token } });
    if (existing) {
      await repo.update({ where: { id: existing.id }, data: { user: user.id, platform } });
    } else {
      await repo.create({ data: { token, platform, user: user.id } });
    }
    ctx.body = { ok: true };
  },
}));
