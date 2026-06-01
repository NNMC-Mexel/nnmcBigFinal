import { factories } from '@strapi/strapi';

// Cast to any: the content-type is new and not yet in Strapi's generated
// ContentType union, so the literal UID would fail `strapi build` type-check.
const UID = 'api::news-comment.news-comment' as any;
const NEWS_UID = 'api::news-post.news-post';

const AUTHOR_POPULATE = {
  author: { fields: ['id', 'username', 'firstName', 'lastName'] },
} as any;

/** Load the current user with the flags needed for moderation checks. */
async function loadUserWithDept(strapi: any, userId: number) {
  return (await strapi.entityService.findOne('plugin::users-permissions.user', userId, {
    fields: ['id', 'isSuperAdmin'],
    populate: ['department'],
  })) as any;
}

/** Moderators (SuperAdmin / news-managing department) may edit or delete any comment. */
function canModerate(fullUser: any): boolean {
  return Boolean(fullUser?.isSuperAdmin) || fullUser?.department?.canManageNews === true;
}

/** Resolve a news-post reference (numeric id, documentId, or relation object) to a numeric id. */
async function resolveNewsPostId(strapi: any, ref: any): Promise<number | null> {
  let value = ref;
  if (value && typeof value === 'object') {
    value = value.id ?? value.documentId ?? null;
  }
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value);
  if (/^\d+$/.test(raw)) {
    const post = (await strapi.entityService.findOne(NEWS_UID, Number(raw), {
      fields: ['id'],
    })) as any;
    return post?.id || null;
  }

  const doc = (await strapi.documents(NEWS_UID).findOne({
    documentId: raw,
    fields: ['id'],
  })) as any;
  return doc?.id || null;
}

/** Find a comment by route param (numeric id or documentId), with its author populated. */
async function findCommentByParam(strapi: any, idParam: any) {
  const raw = String(idParam || '');
  if (/^\d+$/.test(raw)) {
    return (await strapi.entityService.findOne(UID, Number(raw), {
      populate: ['author'],
    })) as any;
  }
  return (await strapi.documents(UID).findOne({
    documentId: raw,
    populate: ['author'],
  })) as any;
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  // find / findOne fall back to the default core controller (any authenticated user can read).

  async create(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const data = ctx.request.body?.data || {};
    const text = String(data.text || '').trim();
    if (!text) return ctx.badRequest('Текст комментария обязателен');

    const newsPostId = await resolveNewsPostId(strapi, data.newsPost ?? data.newsPostId);
    if (!newsPostId) return ctx.notFound('Новость не найдена');

    const entry = await strapi.entityService.create(UID, {
      data: {
        text,
        newsPost: newsPostId,
        author: user.id,
      },
      populate: AUTHOR_POPULATE,
    });

    ctx.body = { data: entry };
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const existing = await findCommentByParam(strapi, ctx.params.id);
    if (!existing) return ctx.notFound('Комментарий не найден');

    const isAuthor = Number(existing.author?.id) === Number(user.id);
    if (!isAuthor && !canModerate(await loadUserWithDept(strapi, user.id))) {
      return ctx.forbidden('Можно редактировать только свой комментарий');
    }

    const text = String(ctx.request.body?.data?.text || '').trim();
    if (!text) return ctx.badRequest('Текст комментария обязателен');

    const entry = await strapi.entityService.update(UID, existing.id, {
      data: { text },
      populate: AUTHOR_POPULATE,
    });

    ctx.body = { data: entry };
  },

  async delete(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const existing = await findCommentByParam(strapi, ctx.params.id);
    if (!existing) return ctx.notFound('Комментарий не найден');

    const isAuthor = Number(existing.author?.id) === Number(user.id);
    if (!isAuthor && !canModerate(await loadUserWithDept(strapi, user.id))) {
      return ctx.forbidden('Можно удалить только свой комментарий');
    }

    await strapi.entityService.delete(UID, existing.id);

    ctx.body = { data: { id: existing.id, documentId: existing.documentId } };
  },
}));
