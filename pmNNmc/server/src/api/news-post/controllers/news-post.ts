import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::news-post.news-post', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

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
}));
