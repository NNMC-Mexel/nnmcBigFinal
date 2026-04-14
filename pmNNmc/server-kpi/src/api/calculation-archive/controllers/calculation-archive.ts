import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::calculation-archive.calculation-archive', ({ strapi }) => ({
  async find(ctx) {
    const { data, meta } = await super.find(ctx);
    return { data, meta };
  },

  async findOne(ctx) {
    return await super.findOne(ctx);
  },

  async delete(ctx) {
    return await super.delete(ctx);
  },
}));
