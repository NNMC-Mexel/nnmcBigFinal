import { startEmployeeSyncScheduler } from './api/employee-card/services/employee-sync';

const PERMISSION_UID = 'plugin::users-permissions.permission' as any;
const ROLE_UID = 'plugin::users-permissions.role' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const DEPARTMENT_UID = 'api::department.department' as any;

const AUTHENTICATED_PERMISSIONS: Record<string, string[]> = {
  'api::bpm-request.bpm-request': ['find', 'findOne', 'topTypes', 'createVacation', 'sendToOneC'],
  'api::employee-card.employee-card': ['find', 'findOne', 'me', 'sync', 'syncStatus'],
  'api::department.department': ['find', 'findOne'],
  'plugin::users-permissions.user': ['me'],
  'plugin::users-permissions.auth': ['callback', 'connect', 'changePassword'],
};

const PUBLIC_PERMISSIONS: Record<string, string[]> = {
  'plugin::users-permissions.auth': ['callback', 'connect'],
};

function envList(name: string): string[] {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function ensurePermission(strapi: any, roleId: number, contentType: string, action: string) {
  const permissionAction = `${contentType}.${action}`;
  const existing = await strapi.db.query(PERMISSION_UID).findMany({
    where: {
      role: roleId,
      action: permissionAction,
    },
  });

  if (existing.length === 0) {
    await strapi.db.query(PERMISSION_UID).create({
      data: {
        action: permissionAction,
        role: roleId,
        enabled: true,
      },
    });
    return;
  }

  for (const permission of existing) {
    if (!permission.enabled) {
      await strapi.db.query(PERMISSION_UID).update({
        where: { id: permission.id },
        data: { enabled: true },
      });
    }
  }
}

async function setupPermissions(strapi: any) {
  const roles = await strapi.db.query(ROLE_UID).findMany();
  const publicRole = roles.find((role: any) => role.type === 'public');
  const authenticatedRole = roles.find((role: any) => role.type === 'authenticated');

  if (publicRole) {
    for (const [contentType, actions] of Object.entries(PUBLIC_PERMISSIONS)) {
      for (const action of actions) {
        await ensurePermission(strapi, publicRole.id, contentType, action);
      }
    }
  }

  if (authenticatedRole) {
    for (const [contentType, actions] of Object.entries(AUTHENTICATED_PERMISSIONS)) {
      for (const action of actions) {
        await ensurePermission(strapi, authenticatedRole.id, contentType, action);
      }
    }
  }
}

async function seedAccessDepartments(strapi: any) {
  const defaults = [
    {
      key: 'HR',
      name_ru: 'Кадры',
      name_kz: 'Кадрлар',
      canViewBpm: true,
      canManageEmployees: true,
    },
    {
      key: 'ACCOUNTING',
      name_ru: 'Бухгалтерия',
      name_kz: 'Бухгалтерия',
      canViewBpm: true,
      canManageEmployees: false,
    },
  ];

  for (const item of defaults) {
    const existing = await strapi.db.query(DEPARTMENT_UID).findOne({
      where: { key: item.key },
    });
    if (!existing) {
      await strapi.entityService.create(DEPARTMENT_UID, { data: item });
    }
  }
}

async function promoteConfiguredSuperAdmins(strapi: any) {
  const identifiers = envList('BPM_SUPERADMIN_USERNAMES');
  if (identifiers.length === 0) return;

  for (const identifier of identifiers) {
    const users = await strapi.entityService.findMany(USER_UID, {
      filters: {
        $or: [
          { username: identifier },
          { email: identifier },
        ],
      },
      limit: 10,
    } as any);

    for (const user of users || []) {
      if (!user.isSuperAdmin) {
        await strapi.entityService.update(USER_UID, user.id, {
          data: { isSuperAdmin: true } as any,
        });
        strapi.log.info(`[bpm] Promoted ${user.username || user.email} to BPM SuperAdmin`);
      }
    }
  }
}

export default {
  register() {},

  async bootstrap({ strapi }) {
    await setupPermissions(strapi);
    await seedAccessDepartments(strapi);
    await promoteConfiguredSuperAdmins(strapi);
    startEmployeeSyncScheduler(strapi);
  },
};
