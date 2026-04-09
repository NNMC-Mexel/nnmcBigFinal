import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::project-document.project-document', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const data = ctx.request.body?.data || {};

    const entry = await strapi.entityService.create('api::project-document.project-document', {
      data: {
        ...data,
        uploadedBy: user.id,
      },
      populate: ['project', 'file', 'uploadedBy'],
    });

    ctx.body = { data: entry };
  },
}));
