import { createAuditEvent } from '../../../../utils/audit-event';

const snapshotUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    position: user.position,
    avatarUrl: user.avatarUrl,
    avatarFileId: user.avatarFileId,
    department: user.department?.id || user.department || null,
    isSuperAdmin: user.isSuperAdmin,
    canManageTickets: user.canManageTickets,
    isKpiResponsible: user.isKpiResponsible,
    blocked: user.blocked,
    confirmed: user.confirmed,
  };
};

export default {
  async afterCreate(event) {
    const { result } = event;
    
    // Автоматически подтверждаем пользователя при создании
    if (result && !result.confirmed) {
      await strapi.entityService.update('plugin::users-permissions.user', result.id, {
        data: {
          confirmed: true,
        },
      });
    }

    await createAuditEvent(strapi, {
      action: 'create',
      entityType: 'plugin::users-permissions.user',
      entityId: result.id,
      newData: snapshotUser(result),
    });
  },

  async beforeUpdate(event) {
    event.state = event.state || {};
    const id = event?.params?.where?.id;
    if (id) {
      event.state.auditOldData = await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        id,
        { populate: ['department'] }
      );
    }
  },
  
  async afterUpdate(event) {
    await createAuditEvent(strapi, {
      action: 'update',
      entityType: 'plugin::users-permissions.user',
      entityId: event.result?.id || event?.params?.where?.id,
      oldData: snapshotUser(event?.state?.auditOldData),
      newData: snapshotUser(event.result),
    });
  },
};
