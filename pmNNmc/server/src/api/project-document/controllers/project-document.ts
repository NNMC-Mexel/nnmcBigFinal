import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::project-document.project-document', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    // Set uploadedBy to current user
    if (ctx.request.body.data) {
      ctx.request.body.data.uploadedBy = user.id;
    }

    const response = await super.create(ctx);
    return response;
  },
}));
