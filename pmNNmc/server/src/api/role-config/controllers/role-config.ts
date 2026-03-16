import { Context } from 'koa';

async function checkSuperAdmin(ctx: Context, strapi: any): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
    return false;
  }

  const userWithRole = await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    populate: ['role'],
  });

  const roleName = (userWithRole?.role?.name || '').toLowerCase().replace(/\s+/g, '');
  const roleType = (userWithRole?.role?.type || '').toLowerCase().replace(/\s+/g, '');

  const allowedRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
  const isAllowed = allowedRoles.some(role =>
    roleName.includes(role) || roleType.includes(role)
  );

  if (!isAllowed) {
    ctx.throw(403, 'Access denied. Only Super Admin can manage role configs.');
    return false;
  }

  return true;
}

export default {
  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    try {
      const configs = await strapi.entityService.findMany('api::role-config.role-config', {
        sort: { roleName: 'asc' },
      });
      ctx.body = { data: configs };
    } catch (error) {
      console.error('Error fetching role configs:', error);
      ctx.throw(500, 'Error fetching role configs');
    }
  },

  async update(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;
    const {
      canViewDashboard, canViewBoard, canViewTable, canViewHelpdesk,
      canViewKpi, canViewKpiTimesheet, canDeleteProject, canDragProjects,
      defaultModuleAccess,
    } = ctx.request.body as any;

    try {
      const updateData: any = {};

      if (canViewDashboard !== undefined) updateData.canViewDashboard = canViewDashboard;
      if (canViewBoard !== undefined) updateData.canViewBoard = canViewBoard;
      if (canViewTable !== undefined) updateData.canViewTable = canViewTable;
      if (canViewHelpdesk !== undefined) updateData.canViewHelpdesk = canViewHelpdesk;
      if (canViewKpi !== undefined) updateData.canViewKpi = canViewKpi;
      if (canViewKpiTimesheet !== undefined) updateData.canViewKpiTimesheet = canViewKpiTimesheet;
      if (canDeleteProject !== undefined) updateData.canDeleteProject = canDeleteProject;
      if (canDragProjects !== undefined) updateData.canDragProjects = canDragProjects;
      if (defaultModuleAccess !== undefined) updateData.defaultModuleAccess = defaultModuleAccess;

      const config = await strapi.entityService.update('api::role-config.role-config', id, {
        data: updateData,
      });

      ctx.body = { data: config };
    } catch (error) {
      console.error('Error updating role config:', error);
      ctx.throw(500, 'Error updating role config');
    }
  },
};
