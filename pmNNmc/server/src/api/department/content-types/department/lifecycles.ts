import { createAuditEvent } from '../../../../utils/audit-event';

const snapshotDepartment = (department: any) => {
  if (!department) return null;
  return {
    id: department.id,
    documentId: department.documentId,
    key: department.key,
    name_ru: department.name_ru,
    name_kz: department.name_kz,
    canViewKpiTimesheet: department.canViewKpiTimesheet,
    canAccessSigndoc: department.canAccessSigndoc,
  };
};

async function resolveDepartment(strapi: any, where: any) {
  if (!where) return null;
  if (where.id) {
    return await strapi.entityService.findOne('api::department.department', where.id);
  }
  if (where.documentId) {
    return await strapi.documents('api::department.department').findOne({
      documentId: where.documentId,
    });
  }
  return null;
}

export default {
  async afterCreate(event: any) {
    const strapi = (global as any).strapi;
    await createAuditEvent(strapi, {
      action: 'create',
      entityType: 'api::department.department',
      entityId: event.result?.documentId || event.result?.id,
      newData: snapshotDepartment(event.result),
    });
  },

  async beforeUpdate(event: any) {
    const strapi = (global as any).strapi;
    event.state = event.state || {};
    event.state.auditOldData = await resolveDepartment(strapi, event?.params?.where);
  },

  async afterUpdate(event: any) {
    const strapi = (global as any).strapi;
    await createAuditEvent(strapi, {
      action: 'update',
      entityType: 'api::department.department',
      entityId: event.result?.documentId || event.result?.id,
      oldData: snapshotDepartment(event?.state?.auditOldData),
      newData: snapshotDepartment(event.result),
    });
  },

  async beforeDelete(event: any) {
    const strapi = (global as any).strapi;
    event.state = event.state || {};
    event.state.auditOldData = await resolveDepartment(strapi, event?.params?.where);
  },

  async afterDelete(event: any) {
    const strapi = (global as any).strapi;
    await createAuditEvent(strapi, {
      action: 'delete',
      entityType: 'api::department.department',
      entityId: event.result?.documentId || event.result?.id || event?.params?.where?.id,
      oldData: snapshotDepartment(event?.state?.auditOldData || event.result),
    });
  },
};
