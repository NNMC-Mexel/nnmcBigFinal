import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::news-post.news-post', ({ strapi: _strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    // Auto-assign the current user as author
    if (user && ctx.request.body?.data) {
      ctx.request.body.data.author = user.id;
    }
    return super.create(ctx);
  },
}));
