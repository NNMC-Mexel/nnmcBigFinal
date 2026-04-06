import { factories } from '@strapi/strapi';
import { getUserFlags } from '../../../utils/project-assignments';

const ensureSuperAdmin = async (ctx: any, strapi: any) => {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
    return;
  }

  const fullUser = (await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    fields: ['isSuperAdmin'],
  })) as any;

  const { isSuperAdmin } = getUserFlags(fullUser);
  if (!isSuperAdmin) {
    ctx.throw(403, 'Access denied');
  }
};

export default factories.createCoreController('api::activity-log.activity-log', ({ strapi }) => ({
  async find(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.find(ctx);
  },

  async findOne(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.findOne(ctx);
  },
}));
