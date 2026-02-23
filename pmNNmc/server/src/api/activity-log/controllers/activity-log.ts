import { factories } from '@strapi/strapi';
import { getRoleFlags } from '../../../utils/project-assignments';

const ensureNotLead = async (ctx: any, strapi: any) => {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
    return;
  }

  const userWithRole = (await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    populate: ['role'],
  })) as any;

  const { isAdmin, isLead } = getRoleFlags(userWithRole?.role);
  if (isLead && !isAdmin) {
    ctx.throw(403, 'Access denied');
  }
};

export default factories.createCoreController('api::activity-log.activity-log', ({ strapi }) => ({
  async find(ctx) {
    await ensureNotLead(ctx, strapi);
    return await super.find(ctx);
  },

  async findOne(ctx) {
    await ensureNotLead(ctx, strapi);
    return await super.findOne(ctx);
  },
}));
