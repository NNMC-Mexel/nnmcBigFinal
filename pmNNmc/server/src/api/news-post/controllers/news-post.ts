import { factories } from '@strapi/strapi';

/**
 * Управлять новостями (создавать/редактировать/удалять) могут только:
 *  - SuperAdmin, либо
 *  - сотрудники отдела с флагом canManageNews (например, Маркетинг).
 * Остальные авторизованные пользователи могут только просматривать новости
 * и оставлять комментарии (см. api::news-comment).
 */
async function ensureCanManageNews(ctx: any, strapi: any): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) {
    ctx.unauthorized('You must be logged in');
    return false;
  }

  const fullUser = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    user.id,
    { fields: ['id', 'isSuperAdmin'], populate: ['department'] }
  )) as any;

  const allowed =
    Boolean(fullUser?.isSuperAdmin) || fullUser?.department?.canManageNews === true;

  if (!allowed) {
    ctx.forbidden('Только суперадмин или отдел маркетинга могут управлять новостями');
    return false;
  }

  return true;
}

export default factories.createCoreController('api::news-post.news-post', ({ strapi }) => ({
  async create(ctx) {
    if (!(await ensureCanManageNews(ctx, strapi))) return;

    const user = ctx.state.user;
    const data = ctx.request.body?.data || {};

    const entry = await strapi.entityService.create('api::news-post.news-post', {
      data: {
        ...data,
        author: user.id,
      },
      populate: ['coverImage', 'attachments', 'author'],
    });

    ctx.body = { data: entry };
  },

  async update(ctx) {
    if (!(await ensureCanManageNews(ctx, strapi))) return;

    const paramId = ctx.params.id;
    const data = ctx.request.body?.data || {};

    let numericId = Number(paramId);
    if (isNaN(numericId)) {
      const doc = await strapi.documents('api::news-post.news-post').findOne({
        documentId: paramId,
        fields: ['id'],
      }) as any;
      if (!doc) { ctx.throw(404, 'News post not found'); return; }
      numericId = doc.id;
    }

    const entry = await strapi.entityService.update('api::news-post.news-post', numericId, {
      data,
      populate: ['coverImage', 'attachments', 'author'],
    });

    ctx.body = { data: entry };
  },

  async delete(ctx) {
    if (!(await ensureCanManageNews(ctx, strapi))) return;
    return await (super.delete as any)(ctx);
  },
}));
