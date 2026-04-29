import { factories } from '@strapi/strapi';
import { getUserAccess } from '../../../utils/access';

function applyDepartmentFilter(ctx: any, allowedDepartments: string[]) {
  const accessFilter = { department: { $in: allowedDepartments } };
  ctx.query.filters = ctx.query.filters
    ? { $and: [ctx.query.filters, accessFilter] }
    : accessFilter;
}

function canAccessDepartment(access: any, department: string): boolean {
  if (access.isAdmin) return true;
  return (access.allowedDepartments || []).includes(String(department || '').trim());
}

async function findEmployee(strapi: any, id: any) {
  const rawId = String(id || '');
  if (/^\d+$/.test(rawId)) {
    return await strapi.entityService.findOne('api::employee.employee', Number(rawId));
  }
  return await strapi.documents('api::employee.employee').findOne({ documentId: rawId });
}

export default factories.createCoreController('api::employee.employee', ({ strapi }) => ({
  async find(ctx) {
    const access = await getUserAccess(ctx);
    if (!access.isAdmin) {
      const allowedDepartments = access.allowedDepartments || [];
      if (allowedDepartments.length === 0) {
        ctx.body = { data: [], meta: { pagination: { page: 1, pageSize: 0, pageCount: 0, total: 0 } } };
        return;
      }
      applyDepartmentFilter(ctx, allowedDepartments);
    }
    return await super.find(ctx);
  },

  async findOne(ctx) {
    const access = await getUserAccess(ctx);
    const employee = await findEmployee(strapi, ctx.params.id);
    if (!employee) return ctx.notFound('Сотрудник не найден');
    if (!canAccessDepartment(access, employee.department)) {
      return ctx.forbidden('Нет доступа к этому отделу');
    }
    return await super.findOne(ctx);
  },

  async create(ctx) {
    const access = await getUserAccess(ctx);
    const data = ctx.request.body?.data || {};
    if (!canAccessDepartment(access, data.department)) {
      return ctx.forbidden('Нет доступа к этому отделу');
    }
    return await super.create(ctx);
  },

  async update(ctx) {
    const access = await getUserAccess(ctx);
    const employee = await findEmployee(strapi, ctx.params.id);
    if (!employee) return ctx.notFound('Сотрудник не найден');
    if (!canAccessDepartment(access, employee.department)) {
      return ctx.forbidden('Нет доступа к этому отделу');
    }
    const nextDepartment = ctx.request.body?.data?.department;
    if (nextDepartment && !canAccessDepartment(access, nextDepartment)) {
      return ctx.forbidden('Нет доступа к указанному отделу');
    }
    return await super.update(ctx);
  },

  async delete(ctx) {
    const access = await getUserAccess(ctx);
    const employee = await findEmployee(strapi, ctx.params.id);
    if (!employee) return ctx.notFound('Сотрудник не найден');
    if (!canAccessDepartment(access, employee.department)) {
      return ctx.forbidden('Нет доступа к этому отделу');
    }
    return await super.delete(ctx);
  },
}));
