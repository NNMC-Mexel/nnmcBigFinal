import seedData from '../scripts/seed';
import { initNotificationRealtime } from './utils/notification-realtime';

const PROTOCOL_USER_PASSWORD = process.env.NNMC_PROTOCOL_USER_PASSWORD || 'Aa123123!';
const PROTOCOL_USER_SEED_VERSION = 'radiology-kpi-protocol-2026-04-30';
const HELPDESK_USER_PASSWORD = process.env.NNMC_HELPDESK_USER_PASSWORD || 'Aa123123!';
const HELPDESK_USER_SEED_VERSION = 'it-helpdesk-2026-05-06';
const RADIOLOGY_DEPARTMENT = {
  key: 'RADIOLOGY',
  name_ru: 'Лучевая',
  name_kz: 'Сәулелік',
};

const itHelpdeskUsers = [
  { username: 'ernar', email: 'ernar@nnmc.kz', firstName: 'Ернар', lastName: '' },
  { username: 'zhandos', email: 'zhandos@nnmc.kz', firstName: 'Жандос', lastName: '' },
  { username: 'said', email: 'said@nnmc.kz', firstName: 'Саид', lastName: '' },
  { username: 'kuat', email: 'kuat@nnmc.kz', firstName: 'Куат', lastName: '' },
  { username: 'bakhodyr', email: 'bakhodyr@nnmc.kz', firstName: 'Баходыр', lastName: '' },
  { username: 'rustam', email: 'rustam@nnmc.kz', firstName: 'Рустам', lastName: '' },
];

const legacyItHelpdeskUsers = [
  { username: 'admin', email: 'admin@example.com' },
  { username: 'it.lead', email: 'it.lead@example.com' },
  { username: 'it.member', email: 'it.member@example.com' },
];

const protocolDepartments = [
  {
    ...RADIOLOGY_DEPARTMENT,
    canViewKpiTimesheet: true,
  },
  {
    key: 'HR',
    name_ru: 'Отдел управления персоналом',
    name_kz: 'Персоналды басқару бөлімі',
  },
  {
    key: 'ECONOMICS',
    name_ru: 'Экономика',
    name_kz: 'Экономика',
  },
  {
    key: 'CLINICAL_PHARMACOLOGY',
    name_ru: 'Клинико-фармакологический отдел',
    name_kz: 'Клиникалық-фармакологиялық бөлім',
  },
  {
    key: 'PATIENT_SUPPORT',
    name_ru: 'Служба поддержки пациента и внутренней экспертизы',
    name_kz: 'Пациентті қолдау және ішкі сараптама қызметі',
  },
  {
    key: 'CLINIC_ADMINISTRATION',
    name_ru: 'Администрация (клиника)',
    name_kz: 'Әкімшілік (клиника)',
  },
  {
    key: 'ACCOUNTING',
    name_ru: 'Отдел бухгалтерского учета и отчетности',
    name_kz: 'Бухгалтерлік есеп және есептілік бөлімі',
  },
];

const radiologyProtocolUsers = [
  {
    username: 'orazbekova.z',
    email: 'orazbekova.z@nnmc.kz',
    firstName: 'Жанар Оримбековна',
    lastName: 'Оразбекова',
    departmentKey: 'RADIOLOGY',
  },
  {
    username: 'eleusizova.l',
    email: 'eleusizova.l@nnmc.kz',
    firstName: 'Ляззат Сарановна',
    lastName: 'Елеусизова',
    departmentKey: 'HR',
  },
  {
    username: 'mikhailov.a',
    email: 'mikhailov.a@nnmc.kz',
    firstName: 'Азат Игоревич',
    lastName: 'Михайлов',
    departmentKey: 'RADIOLOGY',
  },
  {
    username: 'aitymbetova.g',
    email: 'aitymbetova.g@nnmc.kz',
    firstName: 'Гульмира Меирбековна',
    lastName: 'Айтымбетова',
    departmentKey: 'ECONOMICS',
  },
  {
    username: 'kenzhebaeva.s',
    email: 'kenzhebaeva.s@nnmc.kz',
    firstName: 'Шайзат Тукеновна',
    lastName: 'Кенжебаева',
    departmentKey: 'HR',
  },
  {
    username: 'kushenova.s',
    email: 'kushenova.s@nnmc.kz',
    firstName: 'Сауле Жолдасбековна',
    lastName: 'Кушенова',
    departmentKey: 'CLINICAL_PHARMACOLOGY',
  },
  {
    username: 'kurzhukova.a',
    email: 'kurzhukova.a@nnmc.kz',
    firstName: 'Асель Куанышевна',
    lastName: 'Куржукова',
    departmentKey: 'PATIENT_SUPPORT',
  },
  {
    username: 'achkasov.v',
    email: 'achkasov.v@nnmc.kz',
    firstName: 'Владислав Борисович',
    lastName: 'Ачкасов',
    departmentKey: 'PATIENT_SUPPORT',
  },
  {
    username: 'zhumagulov.a',
    email: 'zhumagulov.a@nnmc.kz',
    firstName: 'Алмат Бахчанович',
    lastName: 'Жумагулов',
    departmentKey: 'CLINIC_ADMINISTRATION',
  },
  {
    username: 'mendybaeva.e',
    email: 'mendybaeva.e@nnmc.kz',
    firstName: 'Эльмира Манаповна',
    lastName: 'Мендыбаева',
    departmentKey: 'ECONOMICS',
  },
  {
    username: 'tasemenova.d',
    email: 'tasemenova.d@nnmc.kz',
    firstName: 'Дарига Кошкарбаевна',
    lastName: 'Тасеменова',
    departmentKey: 'ACCOUNTING',
  },
  {
    username: 'saparova.m',
    email: 'saparova.m@nnmc.kz',
    firstName: 'Марина Александровна',
    lastName: 'Сапарова',
    departmentKey: 'ACCOUNTING',
  },
  {
    username: 'zhanuzakova.a',
    email: 'zhanuzakova.a@nnmc.kz',
    firstName: 'Анар Едигеевна',
    lastName: 'Жанузакова',
    departmentKey: 'ACCOUNTING',
  },
];

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
    await syncItHelpdeskUsers(strapi);
    await syncItTicketCategories(strapi);
    initNotificationRealtime(strapi);

    // Always ensure permissions are set correctly
    await setupPermissions(strapi);

    // Migrate: ensure SuperAdmin users + department permissions
    await migrateDepartmentPermissions(strapi);

    await seedKpiProtocolUsers(strapi);
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

  // Public role: only Keycloak/auth callbacks. Helpdesk submission requires login.
  const publicPermissions: Record<string, string[]> = {};
  const publicAuthActions = [
    'plugin::users-permissions.auth.callback',
    'plugin::users-permissions.auth.connect',
  ];

  // Full permissions for all content types
  const fullPermissions: Record<string, string[]> = {
    // Existing content types
    'api::project.project': ['find', 'findOne', 'create', 'update', 'delete', 'assignableUsers'],
    'api::task.task': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::department.department': ['find', 'findOne'],
    'api::board-stage.board-stage': ['find', 'findOne'],
    'api::meeting.meeting': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::activity-log.activity-log': ['find', 'findOne'],
    'api::audit-event.audit-event': ['find', 'findOne'],
    'api::document.document': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::survey-response.survey-response': ['create'],
    // Analytics
    'api::analytics.analytics': ['summary'],
    // Helpdesk content types
    'api::ticket.ticket': ['find', 'findOne', 'findFiltered', 'create', 'update', 'delete', 'reassign', 'assignableUsers', 'submit', 'categories', 'publicSubmit', 'publicCategories'],
    'api::service-group.service-group': ['find', 'findOne'],
    'api::ticket-category.ticket-category': ['find', 'findOne'],
    // News
    'api::news-post.news-post': ['find', 'findOne', 'create', 'update', 'delete'],
    // Project sub-resources
    'api::project-document.project-document': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::project-survey.project-survey': ['find', 'findOne', 'create', 'update', 'delete', 'getResults', 'toggleStatus', 'duplicate'],
    // Admin users (includes department CRUD)
    'api::admin-users.admin-users': [
      'find', 'findOne', 'create', 'update', 'delete',
      'createKeycloakUser', 'resetPassword',
      'getDepartments', 'createDepartment', 'updateDepartment', 'deleteDepartment',
      'updateDepartmentPermissions',
    ],
    // In-app notifications (own only — see controller for row-level filter)
    'api::notification.notification': ['mine', 'unreadCount', 'markRead', 'markAllRead', 'markReadByLink'],
  };

  // Apply public permissions and remove anything not on the allowlist
  if (publicRole) {
    const allowedActions = new Set<string>(publicAuthActions);
    for (const [contentType, actions] of Object.entries(publicPermissions)) {
      for (const action of actions) {
        allowedActions.add(`${contentType}.${action}`);
        await ensurePermission(strapi, publicRole.id, contentType, action);
      }
    }
    for (const action of publicAuthActions) {
      const [ct, act] = action.split(/\.(?=[^.]+$)/);
      await ensurePermission(strapi, publicRole.id, ct, act);
    }

    // Strip any legacy public perms not in allowlist
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findMany({ where: { role: publicRole.id } });
    let stripped = 0;
    for (const perm of existing) {
      if (!allowedActions.has(perm.action)) {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .delete({ where: { id: perm.id } });
        stripped += 1;
      }
    }
    if (stripped > 0) {
      console.log(`  🔒 Public role hardened: removed ${stripped} legacy permissions`);
    }
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

    // Users-permissions plugin: allow to get own profile and login.
    // find/findOne are required so Strapi's REST sanitizer does not strip
    // populated user relations (e.g. project.owner) from responses.
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.user', 'me');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.user', 'find');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.user', 'findOne');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.user', 'update');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.auth', 'callback');
    await ensurePermission(strapi, role.id, 'plugin::users-permissions.auth', 'changePassword');
    await ensurePermission(strapi, role.id, 'plugin::upload.content-api', 'upload');
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

const IT_TICKET_CATEGORIES = [
  { name_ru: 'Поломка компьютера', name_kz: 'Компьютер бұзылуы', slug: 'computer-breakdown', order: 1, users: ['ernar', 'zhandos'] },
  { name_ru: '1С - техподдержка', name_kz: '1С - техникалық қолдау', slug: '1c-support', order: 2, users: ['said'] },
  { name_ru: 'Принтер / МФУ', name_kz: 'Принтер / МФУ', slug: 'printer', order: 3, users: ['ernar', 'zhandos'] },
  { name_ru: 'Интернет / Локальная сеть', name_kz: 'Интернет / Жергілікті желі', slug: 'network', order: 4, users: ['ernar', 'zhandos'] },
  { name_ru: 'СКУД - выдача карт / потеря', name_kz: 'СКУД - карта беру / жоғалту', slug: 'access-control', order: 5, users: ['kuat'] },
  { name_ru: 'СКУД - поломка', name_kz: 'СКУД - бұзылу', slug: 'access-control-repair', order: 6, users: ['kuat'] },
  { name_ru: 'Электронная почта / Outlook', name_kz: 'Электрондық пошта / Outlook', slug: 'email', order: 7, users: ['ernar', 'zhandos'] },
  { name_ru: 'Damumed - техподдержка', name_kz: 'Damumed - техникалық қолдау', slug: 'damumed', order: 8, users: ['bakhodyr'] },
  { name_ru: 'ЛИС - техподдержка', name_kz: 'ЛИС - техникалық қолдау', slug: 'lis', order: 9, users: ['bakhodyr'] },
  { name_ru: 'МЗРК - порталы', name_kz: 'МЗРК - порталдар', slug: 'mzrk', order: 10, users: ['bakhodyr'] },
  { name_ru: 'SimBase - техподдержка', name_kz: 'SimBase - техникалық қолдау', slug: 'simbase', order: 11, users: ['kuat'] },
  { name_ru: 'SimBase - создание аккаунта', name_kz: 'SimBase - аккаунт құру', slug: 'simbase-account', order: 12, users: ['kuat'] },
  { name_ru: 'SimBase - сброс пароля', name_kz: 'SimBase - құпия сөзді қалпына келтіру', slug: 'simbase-password', order: 13, users: ['kuat'] },
  { name_ru: 'Документолог - техподдержка', name_kz: 'Документолог - техникалық қолдау', slug: 'documentolog', order: 14, users: ['kuat'] },
  { name_ru: 'Доменная учетная запись', name_kz: 'Домендік есептік жазба', slug: 'domain-account', order: 15, users: ['rustam'] },
  { name_ru: 'Zoom / Word / Excel', name_kz: 'Zoom / Word / Excel', slug: 'office-software', order: 16, users: ['ernar', 'zhandos'] },
  { name_ru: 'Заправка картриджа', name_kz: 'Картридж толтыру', slug: 'cartridge', order: 17, users: ['ernar', 'zhandos'] },
];

async function findUsersByUsernames(strapi: any, usernames: string[]) {
  if (usernames.length === 0) return [];
  const aliases = usernames.flatMap((username) => [
    username,
    `${username}@nnmc.kz`,
  ]);
  return (await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: {
      $or: [
        { username: { $in: usernames } },
        { email: { $in: aliases } },
      ],
    } as any,
    pagination: { pageSize: 100 },
  })) as any[];
}

async function syncItTicketCategories(strapi: any) {
  try {
    const groups = (await strapi.entityService.findMany('api::service-group.service-group', {
      filters: { slug: 'it-support' } as any,
      limit: 1,
    })) as any[];
    const itGroup = groups?.[0];
    if (!itGroup?.id) return;

    const allowedSlugs = new Set(IT_TICKET_CATEGORIES.map((item) => item.slug));
    const existingCategories = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
      filters: { serviceGroup: { id: itGroup.id } } as any,
      pagination: { pageSize: 1000 },
    })) as any[];

    for (const category of existingCategories || []) {
      if (allowedSlugs.has(category.slug)) continue;
      try {
        await strapi.entityService.update('api::ticket-category.ticket-category', category.id, {
          data: { serviceGroup: null } as any,
        });
      } catch (error: any) {
        strapi.log.warn(`[tickets] Could not hide legacy IT category ${category.slug}: ${error?.message || error}`);
      }
    }

    for (const item of IT_TICKET_CATEGORIES) {
      const users = await findUsersByUsernames(strapi, item.users);
      const assigneeIds = users.map((user: any) => user.id).filter(Boolean);
      const data: any = {
        name_ru: item.name_ru,
        name_kz: item.name_kz,
        slug: item.slug,
        order: item.order,
        serviceGroup: itGroup.id,
        defaultAssignee: {
          set: assigneeIds.map((id: number) => ({ id })),
        },
      };

      const existing = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
        filters: { slug: item.slug } as any,
        limit: 1,
      })) as any[];

      if (existing?.[0]?.id) {
        await strapi.entityService.update('api::ticket-category.ticket-category', existing[0].id, { data });
      } else {
        await strapi.entityService.create('api::ticket-category.ticket-category', { data });
      }
    }

    strapi.log.info('[tickets] IT categories and default assignees synced');
  } catch (error: any) {
    strapi.log.warn(`[tickets] IT categories sync failed: ${error?.message || error}`);
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

  // Базовый набор для всех отделов: новости, заявки, конференц-залы, документооборот
  const BASE: Record<string, boolean> = {
    canViewNews: true,
    canViewDashboard: true,
    canAccessConf: true,
    canAccessSigndoc: true,
    canViewHelpdesk: true,
  };

  const deptDefaults: Record<string, Record<string, boolean>> = {
    // SuperAdmin отдел — отдельно (через isSuperAdmin), флаги тоже на всякий случай
    DIGITALIZATION: {
      ...BASE,
      canViewBoard: true, canViewTable: true,
      canManageNews: true, canDeleteProject: true, canDragProjects: true,
      canManageProjectAssignments: true, canManageTickets: true, canViewActivityLog: true,
    },
    // IT — без KPI Табеля, но с админкой helpdesk и проектов
    IT: {
      ...BASE,
      canViewBoard: true, canViewTable: true,
      canManageNews: true, canDeleteProject: true, canDragProjects: true,
      canManageProjectAssignments: true, canManageTickets: true, canViewActivityLog: true,
    },
    // Инженерная и Медоборудование — без KPI Табеля
    MEDICAL_EQUIPMENT: { ...BASE },
    ENGINEERING: { ...BASE },
    // Отделы с KPI Табелем (включаем только Клининг и Лучевую сейчас)
    CLEANING: { ...BASE, canViewKpiTimesheet: true },
    RADIOLOGY: { ...BASE, canViewKpiTimesheet: true },
    // KPI-eligible отделы (флаг включим позже, по мере готовности)
    ECONOMICS: { ...BASE },
    CLINICAL_PHARMACOLOGY: { ...BASE },
    CLINIC_ADMINISTRATION: { ...BASE },
    PATIENT_SUPPORT: { ...BASE },
    HR: { ...BASE },
    ACCOUNTING: { ...BASE },
    // Приёмная — единственный отдел с журналом приёмной
    RECEPTION: { ...BASE, canAccessJournal: true },
    // Маркетинг — может публиковать новости
    MARKETING: { ...BASE, canManageNews: true, canViewBoard: true, canViewTable: true },
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
    const permissionAction = `${contentType}.${action}`;
    const existing = await strapi.db.query('plugin::users-permissions.permission').findMany({
      where: {
        role: roleId,
        action: permissionAction,
      },
    });

    if (existing.length === 0) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action: permissionAction,
          role: roleId,
          enabled: true,
        },
      });
      return;
    }

    for (const perm of existing) {
      if (!perm.enabled) {
        await strapi.db.query('plugin::users-permissions.permission').update({
          where: { id: perm.id },
          data: { enabled: true },
        });
      }
    }
  } catch (err) {
    // Silently skip if the action doesn't exist (e.g., content type not yet registered)
  }
}

async function getDepartmentByKey(strapi: any, key: string) {
  const existing = await strapi.entityService.findMany('api::department.department', {
    filters: { key } as any,
    limit: 1,
  });
  if (existing?.[0]) return existing[0];

  return await strapi.entityService.create('api::department.department', {
    data: {
      key,
      name_ru: key === 'IT' ? 'Отдел IT' : key,
      name_kz: key,
      canViewNews: true,
      canViewDashboard: true,
      canViewHelpdesk: true,
      canAccessConf: true,
      canAccessSigndoc: true,
      canManageTickets: key === 'IT',
    },
  });
}

async function ensureKeycloakHelpdeskUser(strapi: any, token: string, user: any) {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  if (!keycloakUrl) return;

  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;
  const existing = await findKeycloakUser(adminBase, token, user);
  const payload = {
    username: user.username,
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    enabled: true,
    emailVerified: true,
    attributes: {
      ...(existing?.attributes || {}),
      nnmcHelpdeskSeedVersion: [HELPDESK_USER_SEED_VERSION],
    },
  };

  if (existing?.id) {
    const updateRes = await fetch(`${adminBase}/users/${existing.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!updateRes.ok) {
      strapi.log.warn(`[helpdesk-users] Keycloak update failed for ${user.email}: HTTP ${updateRes.status}`);
      return;
    }
    await setKeycloakPassword(adminBase, token, existing.id, HELPDESK_USER_PASSWORD);
    return;
  }

  const createRes = await fetch(`${adminBase}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...payload,
      credentials: [{
        type: 'password',
        value: HELPDESK_USER_PASSWORD,
        temporary: false,
      }],
    }),
  });

  if (!createRes.ok && createRes.status !== 409) {
    const text = await createRes.text().catch(() => '');
    strapi.log.warn(`[helpdesk-users] Keycloak create failed for ${user.email}: HTTP ${createRes.status} ${text}`);
    return;
  }

  if (createRes.status === 409) {
    const conflicted = await findKeycloakUser(adminBase, token, user);
    if (conflicted?.id) {
      await setKeycloakPassword(adminBase, token, conflicted.id, HELPDESK_USER_PASSWORD);
    }
  }
}

async function deleteKeycloakUserIfExists(strapi: any, token: string, user: any) {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  if (!keycloakUrl) return;

  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;
  const existing = await findKeycloakUser(adminBase, token, user);
  if (!existing?.id) return;

  const res = await fetch(`${adminBase}/users/${existing.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    strapi.log.warn(`[helpdesk-users] Keycloak delete failed for ${user.email}: HTTP ${res.status}`);
  }
}

async function syncItHelpdeskUsers(strapi: any) {
  try {
    const itDepartment = await getDepartmentByKey(strapi, 'IT');
    const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
    const memberRole = roles.find((r: any) => r.type === 'member');
    const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
    const roleId = memberRole?.id || authenticatedRole?.id;
    if (!roleId) {
      strapi.log.warn('[helpdesk-users] No member/authenticated role found');
      return;
    }

    const keycloakToken = await getKeycloakAdminToken(strapi).catch((error: any) => {
      strapi.log.warn(`[helpdesk-users] Keycloak token error: ${error?.message || error}`);
      return null;
    });

    let created = 0;
    let updated = 0;

    for (const item of itHelpdeskUsers) {
      const existing = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email: item.email }, { username: item.username }] } as any,
        limit: 1,
      });

      const userData = {
        username: item.username,
        email: item.email,
        firstName: item.firstName,
        lastName: item.lastName,
        password: HELPDESK_USER_PASSWORD,
        department: itDepartment.id,
        role: roleId,
        provider: 'keycloak',
        confirmed: true,
        blocked: false,
        isSuperAdmin: false,
      };

      if (existing.length === 0) {
        await strapi.entityService.create('plugin::users-permissions.user', { data: userData });
        created += 1;
      } else {
        await strapi.entityService.update('plugin::users-permissions.user', existing[0].id, {
          data: userData,
        });
        updated += 1;
      }

      if (keycloakToken) {
        await ensureKeycloakHelpdeskUser(strapi, keycloakToken, item).catch((error: any) => {
          strapi.log.warn(`[helpdesk-users] Keycloak sync failed for ${item.email}: ${error?.message || error}`);
        });
      }
    }

    for (const legacy of legacyItHelpdeskUsers) {
      if (keycloakToken) {
        await deleteKeycloakUserIfExists(strapi, keycloakToken, legacy).catch((error: any) => {
          strapi.log.warn(`[helpdesk-users] Keycloak delete failed for ${legacy.email}: ${error?.message || error}`);
        });
      }

      const legacyUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email: legacy.email }, { username: legacy.username }] } as any,
        pagination: { pageSize: 10 },
      });

      for (const user of legacyUsers || []) {
        try {
          await strapi.entityService.delete('plugin::users-permissions.user', user.id);
          strapi.log.info(`[helpdesk-users] Deleted legacy IT user ${legacy.username}`);
        } catch (error: any) {
          strapi.log.warn(
            `[helpdesk-users] Could not delete legacy IT user ${legacy.username}; blocking instead: ${error?.message || error}`
          );
          await strapi.entityService.update('plugin::users-permissions.user', user.id, {
            data: { blocked: true, department: null } as any,
          });
        }
      }
    }

    strapi.log.info(`[helpdesk-users] IT users synced: +${created} created, ${updated} updated`);
  } catch (error: any) {
    strapi.log.warn(`[helpdesk-users] Sync failed: ${error?.message || error}`);
  }
}

function protocolDepartmentDefaults(dept: any) {
  return {
    key: dept.key,
    name_ru: dept.name_ru,
    name_kz: dept.name_kz,
    canViewNews: true,
    canViewDashboard: true,
    canViewHelpdesk: true,
    canAccessConf: true,
    canAccessSigndoc: true,
    ...(dept.canViewKpiTimesheet ? { canViewKpiTimesheet: true } : {}),
  };
}

async function ensureProtocolDepartments(strapi: any) {
  const byKey: Record<string, any> = {};

  for (const dept of protocolDepartments) {
    const existing = await strapi.entityService.findMany('api::department.department', {
      filters: { key: dept.key },
      limit: 1,
    });
    const data = protocolDepartmentDefaults(dept);

    if (existing.length === 0) {
      byKey[dept.key] = await strapi.entityService.create('api::department.department', {
        data,
      });
      continue;
    }

    byKey[dept.key] = await strapi.entityService.update(
      'api::department.department',
      existing[0].id,
      { data }
    );
  }

  if (byKey.RADIOLOGY) {
    byKey.RADIOLOGY = await mergeRadiologyDepartments(strapi, byKey.RADIOLOGY);
  }

  return byKey;
}

function isRadiologyDepartment(dept: any): boolean {
  const key = String(dept?.key || '').trim().toUpperCase();
  const name = String(dept?.name_ru || '').trim().toLowerCase();
  return (
    key === RADIOLOGY_DEPARTMENT.key ||
    key.includes('RADIOLOGY') ||
    name.includes('лучевая') ||
    name.includes('лучевой')
  );
}

async function moveDepartmentRelations(strapi: any, fromId: number, toId: number) {
  const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: { department: { id: fromId } },
    pagination: { pageSize: 1000 },
  });
  for (const user of users || []) {
    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
      data: { department: toId },
    });
  }

  const projects = await strapi.entityService.findMany('api::project.project', {
    filters: { department: { id: fromId } },
    pagination: { pageSize: 1000 },
  });
  for (const project of projects || []) {
    await strapi.entityService.update('api::project.project', project.id, {
      data: { department: toId },
    });
  }

  const serviceGroups = await strapi.entityService.findMany('api::service-group.service-group', {
    filters: { department: { id: fromId } },
    pagination: { pageSize: 1000 },
  });
  for (const serviceGroup of serviceGroups || []) {
    await strapi.entityService.update('api::service-group.service-group', serviceGroup.id, {
      data: { department: toId },
    });
  }
}

async function mergeRadiologyDepartments(strapi: any, initialCanonical: any) {
  let canonical = initialCanonical;
  const departments = await strapi.entityService.findMany('api::department.department', {
    pagination: { pageSize: 1000 },
  });

  const radiologyDepartments = (departments || []).filter(isRadiologyDepartment);
  const duplicateDepartments = radiologyDepartments.filter(
    (dept: any) => Number(dept.id) !== Number(canonical.id)
  );

  for (const duplicate of duplicateDepartments) {
    await moveDepartmentRelations(strapi, duplicate.id, canonical.id);
    try {
      await strapi.entityService.delete('api::department.department', duplicate.id);
      strapi.log.info(`[departments] Merged and deleted duplicate radiology department ${duplicate.id}`);
    } catch (error: any) {
      strapi.log.warn(
        `[departments] Could not delete duplicate radiology department ${duplicate.id}: ${error?.message || error}`
      );
    }
  }

  canonical = await strapi.entityService.update('api::department.department', canonical.id, {
    data: {
      ...protocolDepartmentDefaults({
        ...RADIOLOGY_DEPARTMENT,
        canViewKpiTimesheet: true,
      }),
    },
  });

  return canonical;
}

async function getKeycloakAdminToken(strapi: any): Promise<string | null> {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  const adminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
  const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

  if (!keycloakUrl || !adminClientSecret) {
    strapi.log.warn('[protocol-users] Keycloak admin env is missing; Strapi users will be seeded only');
    return null;
  }

  const tokenRes = await fetch(
    `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: adminClientId,
        client_secret: adminClientSecret,
      }),
    }
  );

  if (!tokenRes.ok) {
    strapi.log.warn(`[protocol-users] Failed to get Keycloak admin token: HTTP ${tokenRes.status}`);
    return null;
  }

  const json = await tokenRes.json() as any;
  return json?.access_token || null;
}

async function findKeycloakUser(adminBase: string, token: string, user: any) {
  const headers = { Authorization: `Bearer ${token}` };
  const byUsername = await fetch(
    `${adminBase}/users?username=${encodeURIComponent(user.username)}&exact=true`,
    { headers }
  );
  if (byUsername.ok) {
    const items = await byUsername.json() as any[];
    if (Array.isArray(items) && items[0]) return items[0];
  }

  const byEmail = await fetch(
    `${adminBase}/users?email=${encodeURIComponent(user.email)}&exact=true`,
    { headers }
  );
  if (!byEmail.ok) return null;
  const items = await byEmail.json() as any[];
  return Array.isArray(items) ? items[0] : null;
}

async function setKeycloakPassword(
  adminBase: string,
  token: string,
  userId: string,
  password = PROTOCOL_USER_PASSWORD
) {
  await fetch(`${adminBase}/users/${userId}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'password',
      value: password,
      temporary: false,
    }),
  });
}

async function ensureKeycloakProtocolUser(strapi: any, token: string, user: any) {
  const keycloakUrl = process.env.KEYCLOAK_URL;
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
  if (!keycloakUrl) return;

  const adminBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;
  const existing = await findKeycloakUser(adminBase, token, user);
  const attributes = {
    ...(existing?.attributes || {}),
    nnmcProtocolSeedVersion: [PROTOCOL_USER_SEED_VERSION],
  };
  const payload = {
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    enabled: true,
    emailVerified: true,
    attributes,
  };

  if (existing?.id) {
    const shouldResetPassword =
      process.env.NNMC_PROTOCOL_USER_RESET_PASSWORDS === 'true' ||
      !Array.isArray(existing?.attributes?.nnmcProtocolSeedVersion) ||
      !existing.attributes.nnmcProtocolSeedVersion.includes(PROTOCOL_USER_SEED_VERSION);

    const updateRes = await fetch(`${adminBase}/users/${existing.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!updateRes.ok) {
      strapi.log.warn(`[protocol-users] Keycloak update failed for ${user.email}: HTTP ${updateRes.status}`);
      return;
    }
    if (shouldResetPassword) {
      await setKeycloakPassword(adminBase, token, existing.id);
    }
    return;
  }

  const createRes = await fetch(`${adminBase}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...payload,
      credentials: [{
        type: 'password',
        value: PROTOCOL_USER_PASSWORD,
        temporary: false,
      }],
    }),
  });

  if (!createRes.ok && createRes.status !== 409) {
    const text = await createRes.text().catch(() => '');
    strapi.log.warn(`[protocol-users] Keycloak create failed for ${user.email}: HTTP ${createRes.status} ${text}`);
  }
}

async function seedKpiProtocolUsers(strapi: any) {
  try {
    const departmentsByKey = await ensureProtocolDepartments(strapi);
    const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
    const memberRole = roles.find((r: any) => r.type === 'member');
    const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
    const roleId = memberRole?.id || authenticatedRole?.id;
    if (!roleId) {
      strapi.log.warn('[protocol-users] No member/authenticated role found');
      return;
    }

    const keycloakToken = await getKeycloakAdminToken(strapi).catch((error: any) => {
      strapi.log.warn(`[protocol-users] Keycloak token error: ${error?.message || error}`);
      return null;
    });

    let created = 0;
    let updated = 0;

    for (const item of radiologyProtocolUsers) {
      const department = departmentsByKey[item.departmentKey];
      const existing = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email: item.email }, { username: item.username }] },
        limit: 1,
      });

      const userData = {
        username: item.username,
        email: item.email,
        firstName: item.firstName,
        lastName: item.lastName,
        department: department?.id || null,
        role: roleId,
        provider: 'keycloak',
        confirmed: true,
        blocked: false,
        isSuperAdmin: false,
      };

      if (existing.length === 0) {
        await strapi.entityService.create('plugin::users-permissions.user', {
          data: {
            ...userData,
            password: PROTOCOL_USER_PASSWORD,
          },
        });
        created += 1;
      } else {
        await strapi.entityService.update('plugin::users-permissions.user', existing[0].id, {
          data: userData,
        });
        updated += 1;
      }

      if (keycloakToken) {
        await ensureKeycloakProtocolUser(strapi, keycloakToken, item).catch((error: any) => {
          strapi.log.warn(`[protocol-users] Keycloak sync failed for ${item.email}: ${error?.message || error}`);
        });
      }
    }

    strapi.log.info(`[protocol-users] PM users seeded: +${created} created, ${updated} updated`);
  } catch (error: any) {
    strapi.log.warn(`[protocol-users] Seed failed: ${error?.message || error}`);
  }
}
