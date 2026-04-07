import seedData from '../scripts/seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }) {
    // Run seed on first start (check if departments exist)
    const departments = await strapi.entityService.findMany('api::department.department');

    if (departments.length === 0) {
      console.log('🌱 First start detected, running seed...');
      await seedData();
    } else {
      // Also check if test users exist
      const testUser = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { email: 'digital.lead@example.com' },
      });
      if (testUser.length === 0) {
        console.log('🌱 Test users missing, running seed...');
        await seedData();
      }
    }

    await normalizeTicketCategoryDefaultAssignees(strapi);

    // Always ensure permissions are set correctly
    await setupPermissions(strapi);

    // Migrate: ensure SuperAdmin users + department permissions
    await migrateDepartmentPermissions(strapi);
  },
};

/**
 * Set up API permissions for all roles
 */
async function setupPermissions(strapi: any) {
  console.log('🔐 Setting up permissions...');

  const roles = await strapi.entityService.findMany('plugin::users-permissions.role');

  const publicRole = roles.find((r: any) => r.type === 'public');
  const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
  const superAdminRole = roles.find((r: any) => r.type === 'superadmin');
  const adminRole = roles.find((r: any) => r.type === 'admin');
  const leadRole = roles.find((r: any) => r.type === 'lead');
  const memberRole = roles.find((r: any) => r.type === 'member');

  // Public role permissions
  const publicPermissions: Record<string, string[]> = {
    'api::ticket.ticket': ['publicSubmit', 'publicCategories'],
  };

  // Full permissions for all content types
  const fullPermissions: Record<string, string[]> = {
    // Existing content types
    'api::project.project': ['find', 'findOne', 'create', 'update', 'delete', 'assignableUsers'],
    'api::task.task': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::department.department': ['find', 'findOne'],
    'api::board-stage.board-stage': ['find', 'findOne'],
    'api::meeting.meeting': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::activity-log.activity-log': ['find', 'findOne'],
    'api::document.document': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::survey.survey': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::survey-response.survey-response': ['find', 'findOne', 'create'],
    // Analytics
    'api::analytics.analytics': ['summary'],
    // Helpdesk content types
    'api::ticket.ticket': ['find', 'findOne', 'findFiltered', 'create', 'update', 'delete', 'reassign', 'assignableUsers', 'publicCategories'],
    'api::service-group.service-group': ['find', 'findOne'],
    'api::ticket-category.ticket-category': ['find', 'findOne'],
    // News
    'api::news-post.news-post': ['find', 'findOne', 'create', 'update', 'delete'],
    // Role config
    'api::role-config.role-config': ['find', 'update'],
  };

  // Apply public permissions
  if (publicRole) {
    for (const [contentType, actions] of Object.entries(publicPermissions)) {
      for (const action of actions) {
        await ensurePermission(strapi, publicRole.id, contentType, action);
      }
    }
    // Auth endpoints for public
    await ensurePermission(strapi, publicRole.id, 'plugin::users-permissions.auth', 'callback');
    await ensurePermission(strapi, publicRole.id, 'plugin::users-permissions.auth', 'register');
    await ensurePermission(strapi, publicRole.id, 'plugin::users-permissions.auth', 'forgotPassword');
    await ensurePermission(strapi, publicRole.id, 'plugin::users-permissions.auth', 'resetPassword');
  }

  // Apply permissions to all authenticated-type roles
  const authRoles = [authenticatedRole, superAdminRole, adminRole, leadRole, memberRole].filter(Boolean);

  for (const role of authRoles) {
    // Apply full content permissions
    for (const [contentType, actions] of Object.entries(fullPermissions)) {
      for (const action of actions) {
        await ensurePermission(strapi, role.id, contentType, action);
      }
    }

    // Users-permissions plugin: allow to get own profile and login
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.user', 'me');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.auth', 'callback');
  }

  console.log('  ✅ Permissions configured');
}

async function normalizeTicketCategoryDefaultAssignees(strapi: any) {
  try {
    const categories = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
      populate: ['defaultAssignee'],
      limit: 1000,
    })) as any[];

    let normalizedCount = 0;
    for (const category of categories || []) {
      const defaults = Array.isArray(category.defaultAssignee)
        ? category.defaultAssignee
        : category.defaultAssignee
        ? [category.defaultAssignee]
        : [];
      const defaultIds = defaults
        .map((item: any) => (typeof item === 'number' ? item : item?.id))
        .filter((id: number | undefined) => Boolean(id));
      if (defaultIds.length > 0) {
        await strapi.entityService.update('api::ticket-category.ticket-category', category.id, {
          data: {
            defaultAssignee: {
              set: defaultIds.map((id: number) => ({ id })),
            },
          } as any,
        });
        normalizedCount += 1;
      }
    }

    if (normalizedCount > 0) {
      console.log(`🔁 Normalized ticket categories defaultAssignee: ${normalizedCount}`);
    }
  } catch (err) {
    console.error('Failed to normalize ticket category assignees:', err);
  }
}

/**
 * One-time migration: promote SuperAdmin-role users to isSuperAdmin=true,
 * and seed department permission flags if all are false.
 */
async function migrateDepartmentPermissions(strapi: any) {
  console.log('🔄 Checking department permissions migration...');

  // 1. Find SuperAdmin role and promote its users
  const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
  const superAdminRole = roles.find((r: any) => r.type === 'superadmin');

  if (superAdminRole) {
    const saUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: { role: { id: superAdminRole.id } },
    });
    for (const u of saUsers) {
      if (!u.isSuperAdmin) {
        await strapi.entityService.update('plugin::users-permissions.user', u.id, {
          data: { isSuperAdmin: true },
        });
        console.log(`  ✅ Promoted to isSuperAdmin: ${u.username || u.email}`);
      }
    }
  }

  // 2. Also ensure testnnmc is SuperAdmin (Keycloak-created user, may not be in SuperAdmin role)
  const testUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: { $or: [{ username: 'testnnmc' }, { email: 'testnnmc@nnmc.kz' }] },
  });
  for (const u of testUsers) {
    if (!u.isSuperAdmin) {
      await strapi.entityService.update('plugin::users-permissions.user', u.id, {
        data: { isSuperAdmin: true },
      });
      console.log(`  ✅ Promoted testnnmc to isSuperAdmin: ${u.username || u.email}`);
    }
  }

  // 3. Seed default permissions on departments that have all flags = false
  const permissionFlags = [
    'canViewNews', 'canViewDashboard', 'canViewBoard', 'canViewTable',
    'canViewHelpdesk', 'canViewKpiIt', 'canViewKpiMedical', 'canViewKpiEngineering',
    'canViewKpiTimesheet', 'canAccessConf', 'canAccessJournal', 'canAccessSigndoc',
    'canManageNews', 'canDeleteProject', 'canDragProjects',
    'canManageProjectAssignments', 'canManageTickets', 'canViewActivityLog',
  ];

  const deptDefaults: Record<string, Record<string, boolean>> = {
    IT: {
      canViewNews: true, canViewDashboard: true, canViewBoard: true, canViewTable: true,
      canViewHelpdesk: true, canViewKpiIt: true, canViewKpiTimesheet: true,
      canAccessConf: true, canAccessJournal: true, canAccessSigndoc: true,
      canManageNews: true, canDeleteProject: true, canDragProjects: true,
      canManageProjectAssignments: true, canManageTickets: true, canViewActivityLog: true,
    },
    DIGITALIZATION: {
      canViewNews: true, canViewDashboard: true, canViewBoard: true, canViewTable: true,
      canAccessConf: true,
    },
    MEDICAL_EQUIPMENT: {
      canViewNews: true, canViewHelpdesk: true, canViewKpiMedical: true,
    },
    ENGINEERING: {
      canViewNews: true, canViewHelpdesk: true, canViewKpiEngineering: true,
    },
  };

  const departments = await strapi.entityService.findMany('api::department.department');
  for (const dept of departments) {
    const allFalse = permissionFlags.every((f) => !dept[f]);
    if (!allFalse) continue; // already configured

    const defaults = deptDefaults[dept.key];
    if (!defaults) continue; // unknown department, skip

    await strapi.entityService.update('api::department.department', dept.id, {
      data: defaults,
    });
    console.log(`  ✅ Seeded permissions for department: ${dept.name_ru} (${dept.key})`);
  }

  console.log('  ✅ Department permissions migration complete');
}

async function ensurePermission(strapi: any, roleId: number, contentType: string, action: string) {
  try {
    // Find existing permission
    const existing = await strapi.db.query('plugin::users-permissions.permission').findMany({
      where: {
        role: roleId,
        action: `${contentType}.${action}`,
      },
    });

    if (existing.length === 0) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action: `${contentType}.${action}`,
          role: roleId,
        },
      });
    }
  } catch (err) {
    // Silently skip if the action doesn't exist (e.g., content type not yet registered)
  }
}
