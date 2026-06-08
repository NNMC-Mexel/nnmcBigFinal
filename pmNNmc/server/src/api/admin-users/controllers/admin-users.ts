import { Context } from 'koa';
// Allowlist полей для department CRUD
const DEPT_FIELDS = ['key', 'name_ru', 'name_kz', 'description'];
const DEPT_PERMISSION_FLAGS = [
  'canViewNews', 'canViewDashboard', 'canViewBoard', 'canViewTable',
  'canViewHelpdesk', 'canViewKpiIt', 'canViewKpiMedical', 'canViewKpiEngineering',
  'canViewKpiTimesheet', 'canAccessConf', 'canAccessJournal', 'canAccessSigndoc',
  'canManageNews', 'canDeleteProject', 'canDragProjects',
  'canManageProjectAssignments', 'canManageTickets', 'canViewActivityLog',
];
const ALLOWED_DEPT_FIELDS = [...DEPT_FIELDS, ...DEPT_PERMISSION_FLAGS];
const HELPDESK_DEPARTMENT_KEYS = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];

const DEFAULT_KEYCLOAK_INITIAL_PASSWORD = 'Aa123123!';
const KEYCLOAK_PASSWORD_REQUIRED_ACTION = 'UPDATE_PASSWORD';

function sanitizeFields(data: Record<string, any>, allowlist: string[]): Record<string, any> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => allowlist.includes(k)));
}

function cleanString(value: any): string {
  return String(value || '').trim();
}

function keycloakProfilePatch(user: any): Record<string, any> {
  const email = cleanString(user?.email).toLowerCase();
  const username = cleanString(user?.username) || email;
  const fallbackName = cleanString(user?.firstName) || cleanString(user?.lastName) || username || email.split('@')[0] || 'user';

  return {
    username,
    email,
    firstName: cleanString(user?.firstName) || fallbackName,
    lastName: cleanString(user?.lastName) || fallbackName,
    enabled: user?.blocked === undefined ? true : !user.blocked,
    emailVerified: true,
  };
}

function relationItems(value: any): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatHelpdeskUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    blocked: user.blocked,
    position: user.position,
    canManageTickets: user.canManageTickets,
    department: user.department
      ? {
          id: user.department.id,
          key: user.department.key,
          name_ru: user.department.name_ru,
          name_kz: user.department.name_kz,
        }
      : null,
  };
}

async function loadHelpdeskRouting(strapi: any) {
  const serviceGroups = (await strapi.entityService.findMany('api::service-group.service-group', {
    filters: { department: { key: { $in: HELPDESK_DEPARTMENT_KEYS } } } as any,
    populate: ['department'],
    pagination: { pageSize: 100 },
  })) as any[];

  const groupIds = (serviceGroups || []).map((group: any) => group.id).filter(Boolean);
  const categories = groupIds.length > 0
    ? ((await strapi.entityService.findMany('api::ticket-category.ticket-category', {
        filters: { serviceGroup: { id: { $in: groupIds } } } as any,
        populate: {
          serviceGroup: true,
          defaultAssignee: { populate: ['department'] },
        } as any,
        sort: { order: 'asc', name_ru: 'asc' } as any,
        pagination: { pageSize: 1000 },
      })) as any[])
    : [];

  const categoriesByGroup = new Map<number, any[]>();
  for (const category of categories || []) {
    const groupId = Number(category?.serviceGroup?.id);
    if (!groupId) continue;
    const list = categoriesByGroup.get(groupId) || [];
    list.push({
      id: category.id,
      documentId: category.documentId,
      name_ru: category.name_ru,
      name_kz: category.name_kz,
      slug: category.slug,
      order: category.order,
      defaultAssignee: relationItems(category.defaultAssignee).map(formatHelpdeskUser),
    });
    categoriesByGroup.set(groupId, list);
  }

  const order = new Map(HELPDESK_DEPARTMENT_KEYS.map((key, index) => [key, index]));
  const groups = (serviceGroups || [])
    .sort((a: any, b: any) => {
      const aOrder = order.get(a?.department?.key) ?? 99;
      const bOrder = order.get(b?.department?.key) ?? 99;
      return aOrder - bOrder || String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru');
    })
    .map((group: any) => ({
      id: group.id,
      documentId: group.documentId,
      name_ru: group.name_ru,
      name_kz: group.name_kz,
      slug: group.slug,
      department: group.department
        ? {
            id: group.department.id,
            key: group.department.key,
            name_ru: group.department.name_ru,
            name_kz: group.department.name_kz,
          }
        : null,
      categories: categoriesByGroup.get(group.id) || [],
    }));

  const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: {
      department: { key: { $in: HELPDESK_DEPARTMENT_KEYS } },
      blocked: false,
    } as any,
    fields: ['id', 'username', 'email', 'firstName', 'lastName', 'position', 'blocked', 'canManageTickets'],
    populate: ['department'],
    sort: { firstName: 'asc', lastName: 'asc', username: 'asc' } as any,
    pagination: { pageSize: 1000 },
  })) as any[];

  return {
    groups,
    users: (users || []).map(formatHelpdeskUser),
  };
}

// Проверка что пользователь - супер админ (по флагу isSuperAdmin)
async function checkSuperAdmin(ctx: Context, strapi: any): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
    return false;
  }

  const fullUser = await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    fields: ['isSuperAdmin'],
  });

  if (!fullUser?.isSuperAdmin) {
    ctx.throw(403, 'Access denied. Only SuperAdmin can manage users.');
    return false;
  }

  return true;
}

function getKeycloakConfig() {
  return {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM || 'nnmc',
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
    adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
  };
}

async function getKeycloakAdminToken(strapi: any): Promise<string | null> {
  const { url, realm, adminClientId, adminClientSecret } = getKeycloakConfig();
  if (!url || !adminClientSecret) return null;

  const tokenRes = await fetch(`${url}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: adminClientId,
      client_secret: adminClientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => '');
    strapi.log.error('[keycloak-admin] Token error:', err);
    return null;
  }

  const data = await tokenRes.json() as any;
  return data?.access_token || null;
}

async function findKeycloakUser(token: string, user: { username?: string; email?: string }) {
  const { url, realm } = getKeycloakConfig();
  if (!url) return null;

  const adminBase = `${url}/admin/realms/${realm}`;
  const headers = { Authorization: `Bearer ${token}` };
  const username = String(user.username || '').trim();
  const email = String(user.email || '').trim().toLowerCase();

  if (username) {
    const byUsername = await fetch(
      `${adminBase}/users?username=${encodeURIComponent(username)}&exact=true`,
      { headers }
    );
    if (byUsername.ok) {
      const items = await byUsername.json() as any[];
      if (Array.isArray(items) && items[0]) return items[0];
    }
  }

  if (!email) return null;
  const byEmail = await fetch(
    `${adminBase}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers }
  );
  if (!byEmail.ok) return null;
  const items = await byEmail.json() as any[];
  return Array.isArray(items) ? items[0] : null;
}

async function updateKeycloakProfile(token: string, keycloakUser: any, patch: Record<string, any>) {
  const { url, realm } = getKeycloakConfig();
  if (!url || !keycloakUser?.id) return;

  const requiredActions = Array.isArray(patch.requiredActions)
    ? patch.requiredActions
    : Array.isArray(keycloakUser.requiredActions)
      ? keycloakUser.requiredActions
      : [];

  const body: Record<string, any> = {
    username: patch.username ?? keycloakUser.username,
    email: patch.email ?? keycloakUser.email,
    firstName: patch.firstName ?? keycloakUser.firstName,
    lastName: patch.lastName ?? keycloakUser.lastName,
    enabled: patch.enabled ?? keycloakUser.enabled ?? true,
    emailVerified: patch.emailVerified ?? keycloakUser.emailVerified ?? true,
    attributes: {
      ...(keycloakUser.attributes || {}),
      ...(patch.attributes || {}),
    },
    requiredActions,
  };

  const res = await fetch(`${url}/admin/realms/${realm}/users/${keycloakUser.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Keycloak profile update failed (HTTP ${res.status})${text ? `: ${text}` : ''}`);
  }
}

async function setKeycloakTemporaryPassword(
  strapi: any,
  token: string,
  keycloakUser: any,
  password: string,
  profilePatch: Record<string, any> = {}
) {
  const { url, realm } = getKeycloakConfig();
  if (!url || !keycloakUser?.id) {
    throw new Error('Keycloak user not found');
  }

  const resetRes = await fetch(`${url}/admin/realms/${realm}/users/${keycloakUser.id}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'password',
      value: password,
      temporary: true,
    }),
  });

  if (!resetRes.ok) {
    const text = await resetRes.text().catch(() => '');
    throw new Error(`Keycloak password reset failed (HTTP ${resetRes.status})${text ? `: ${text}` : ''}`);
  }

  try {
    await updateKeycloakProfile(token, keycloakUser, {
      ...profilePatch,
      requiredActions: [KEYCLOAK_PASSWORD_REQUIRED_ACTION],
    });
  } catch (error: any) {
    strapi.log.warn(`[keycloak-admin] Could not persist required action: ${error?.message || error}`);
  }
}

export default {
  // ─── Users ────────────────────────────────────────────

  // Получить список всех пользователей
  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    try {
      const { department, search, blocked } = ctx.query;

      const filters: any = {};

      if (department) {
        filters.department = { id: department };
      }

      if (blocked !== undefined) {
        filters.blocked = blocked === 'true';
      }

      if (search) {
        filters.$or = [
          { username: { $containsi: search } },
          { email: { $containsi: search } },
          { firstName: { $containsi: search } },
          { lastName: { $containsi: search } },
        ];
      }

      const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters,
        populate: ['department'],
        sort: { createdAt: 'desc' },
      });

      const safeUsers = users.map((user: any) => {
        const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;
        return safeUser;
      });

      ctx.body = { data: safeUsers };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error fetching users:', error);
      ctx.throw(500, 'Error fetching users');
    }
  },

  // Получить одного пользователя
  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;

    try {
      const user = await strapi.entityService.findOne('plugin::users-permissions.user', id, {
        populate: ['department'],
      });

      if (!user) {
        ctx.throw(404, 'User not found');
        return;
      }

      const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;
      ctx.body = { data: safeUser };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error fetching user:', error);
      ctx.throw(500, 'Error fetching user');
    }
  },

  // Создать пользователя
  async create(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const {
      email, username, firstName, lastName, department, blocked, isSuperAdmin, canManageTickets,
    } = ctx.request.body as any;

    if (!email || !username) {
      ctx.throw(400, 'Email and username are required');
      return;
    }

    try {
      const existingEmail = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { email },
      });
      if (existingEmail.length > 0) {
        ctx.throw(400, 'Email already exists');
        return;
      }

      const existingUsername = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { username },
      });
      if (existingUsername.length > 0) {
        ctx.throw(400, 'Username already exists');
        return;
      }

      const password = DEFAULT_KEYCLOAK_INITIAL_PASSWORD;

      // Look up the "Authenticated" role dynamically
      const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
      const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
      if (!authenticatedRole) {
        ctx.throw(500, 'Authenticated role not found');
        return;
      }

      const user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          email,
          username,
          firstName: firstName || '',
          lastName: lastName || '',
          password,
          role: authenticatedRole.id,
          department: department || null,
          blocked: blocked || false,
          confirmed: true,
          provider: 'local',
          isSuperAdmin: isSuperAdmin || false,
          canManageTickets: canManageTickets || false,
        },
      });

      const { password: _, ...safeUser } = user;

      ctx.body = {
        data: safeUser,
        generatedPassword: password,
        message: 'User created successfully with the standard initial password',
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      ctx.throw(500, error.message || 'Error creating user');
    }
  },

  // Обновить пользователя
  async update(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;
    const {
      firstName, lastName, department, blocked, isSuperAdmin, canManageTickets,
    } = ctx.request.body as any;

    try {
      const updateData: any = {};

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (department !== undefined) updateData.department = department;
      if (blocked !== undefined) updateData.blocked = blocked;
      if (isSuperAdmin !== undefined) updateData.isSuperAdmin = isSuperAdmin;
      if (canManageTickets !== undefined) updateData.canManageTickets = canManageTickets;

      const user = await strapi.entityService.update('plugin::users-permissions.user', id, {
        data: updateData,
        populate: ['department'],
      });

      const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;

      ctx.body = {
        data: safeUser,
        message: 'User updated successfully',
      };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error updating user:', error);
      ctx.throw(500, 'Error updating user');
    }
  },

  // Сброс пароля
  async resetPassword(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;

    try {
      const user = await strapi.entityService.findOne('plugin::users-permissions.user', id);
      if (!user) {
        ctx.throw(404, 'User not found');
        return;
      }

      const password = DEFAULT_KEYCLOAK_INITIAL_PASSWORD;
      let requiresPasswordUpdate = false;

      const token = await getKeycloakAdminToken(strapi);
      if (token) {
        const keycloakUser = await findKeycloakUser(token, user);
        if (keycloakUser?.id) {
          await setKeycloakTemporaryPassword(strapi, token, keycloakUser, password, keycloakProfilePatch(user));
          requiresPasswordUpdate = true;
        } else if (user.provider === 'keycloak') {
          ctx.throw(404, 'Keycloak user not found');
          return;
        }
      } else if (user.provider === 'keycloak') {
        ctx.throw(500, 'Keycloak admin credentials not configured');
        return;
      }

      await strapi.entityService.update('plugin::users-permissions.user', id, {
        data: { password },
      });

      ctx.body = {
        message: 'Password reset to the standard initial password',
        newPassword: password,
        requiresPasswordUpdate,
      };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error resetting password:', error);
      ctx.throw(500, 'Error resetting password');
    }
  },

  // Удалить пользователя
  async delete(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;

    try {
      if (ctx.state.user.id === parseInt(id)) {
        ctx.throw(400, 'Cannot delete yourself');
        return;
      }

      await strapi.entityService.delete('plugin::users-permissions.user', id);

      ctx.body = { message: 'User deleted successfully' };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error deleting user:', error);
      ctx.throw(500, 'Error deleting user');
    }
  },

  // ─── Departments ──────────────────────────────────────

  // Получить все отделы
  async getDepartments(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    try {
      const departments = await strapi.entityService.findMany('api::department.department', {
        sort: { name_ru: 'asc' },
      });

      ctx.body = { data: departments };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error fetching departments:', error);
      ctx.throw(500, 'Error fetching departments');
    }
  },

  // Создать отдел
  async createDepartment(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const body = ctx.request.body as any;
    const { key, name_ru, name_kz, description, ...permissionFlags } = body;

    if (!key || !name_ru || !name_kz) {
      ctx.throw(400, 'key, name_ru and name_kz are required');
      return;
    }

    try {
      const existing = await strapi.entityService.findMany('api::department.department', {
        filters: { key },
      });
      if (existing.length > 0) {
        ctx.throw(400, 'Department with this key already exists');
        return;
      }

      const safeFlags = sanitizeFields(permissionFlags, DEPT_PERMISSION_FLAGS);
      const department = await strapi.entityService.create('api::department.department', {
        data: { key, name_ru, name_kz, description: description || null, ...safeFlags },
      });

      ctx.body = { data: department, message: 'Department created successfully' };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error creating department:', error);
      ctx.throw(500, error.message || 'Error creating department');
    }
  },

  // Обновить отдел
  async updateDepartment(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;
    const body = ctx.request.body as any;
    const sanitized = sanitizeFields(body, ALLOWED_DEPT_FIELDS);

    try {
      const department = await strapi.entityService.update('api::department.department', id, {
        data: sanitized,
      });

      ctx.body = { data: department, message: 'Department updated successfully' };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error updating department:', error);
      ctx.throw(500, 'Error updating department');
    }
  },

  // Удалить отдел
  async deleteDepartment(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { id } = ctx.params;

    try {
      // Проверяем, нет ли пользователей в этом отделе
      const usersInDept = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { department: { id } },
        fields: ['id'],
      });

      if (usersInDept.length > 0) {
        ctx.throw(400, `Cannot delete department: ${usersInDept.length} users are assigned to it`);
        return;
      }

      await strapi.entityService.delete('api::department.department', id);

      ctx.body = { message: 'Department deleted successfully' };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error deleting department:', error);
      ctx.throw(500, 'Error deleting department');
    }
  },

  // Массовое обновление прав отделов (permission matrix)
  async updateDepartmentPermissions(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { departments } = ctx.request.body as any;

    if (!Array.isArray(departments)) {
      ctx.throw(400, 'departments array is required');
      return;
    }

    try {
      const results = [];
      for (const dept of departments) {
        const { id, ...permissions } = dept;
        if (!id) continue;
        const safePerms = sanitizeFields(permissions, DEPT_PERMISSION_FLAGS);
        const updated = await strapi.entityService.update('api::department.department', id, {
          data: safePerms,
        });
        results.push(updated);
      }

      ctx.body = { data: results, message: 'Permissions updated successfully' };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error updating department permissions:', error);
      ctx.throw(500, 'Error updating department permissions');
    }
  },

  // Создать пользователя в Keycloak + Strapi
  async getHelpdeskRouting(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    try {
      ctx.body = { data: await loadHelpdeskRouting(strapi) };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error fetching helpdesk routing:', error);
      ctx.throw(500, 'Error fetching helpdesk routing');
    }
  },

  async updateHelpdeskRouting(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const { categories } = ctx.request.body as any;
    if (!Array.isArray(categories)) {
      ctx.throw(400, 'categories array is required');
      return;
    }

    try {
      const categoryIds = categories
        .map((item: any) => Number(item?.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);
      const uniqueCategoryIds = Array.from(new Set(categoryIds));

      const requestedAssigneeIds = Array.from(
        new Set(
          categories
            .flatMap((item: any) => (Array.isArray(item?.assigneeIds) ? item.assigneeIds : []))
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        )
      );

      const allowedCategories = uniqueCategoryIds.length > 0
        ? ((await strapi.entityService.findMany('api::ticket-category.ticket-category', {
            filters: {
              id: { $in: uniqueCategoryIds },
              serviceGroup: { department: { key: { $in: HELPDESK_DEPARTMENT_KEYS } } },
            } as any,
            populate: { serviceGroup: { populate: ['department'] } } as any,
            pagination: { pageSize: 1000 },
          })) as any[])
        : [];
      const allowedCategoryIds = new Set((allowedCategories || []).map((category: any) => Number(category.id)));
      const categoryDepartmentById = new Map(
        (allowedCategories || []).map((category: any) => [
          Number(category.id),
          category?.serviceGroup?.department?.key,
        ])
      );

      if (allowedCategoryIds.size !== uniqueCategoryIds.length) {
        ctx.throw(400, 'One or more categories are not part of helpdesk routing');
        return;
      }

      const allowedAssigneeIds = requestedAssigneeIds.length > 0
        ? ((await strapi.entityService.findMany('plugin::users-permissions.user', {
            filters: {
              id: { $in: requestedAssigneeIds },
              department: { key: { $in: HELPDESK_DEPARTMENT_KEYS } },
              blocked: false,
            } as any,
            fields: ['id'],
            populate: ['department'],
            pagination: { pageSize: 1000 },
          })) as any[])
        : [];
      const allowedAssigneeIdSet = new Set((allowedAssigneeIds || []).map((user: any) => Number(user.id)));
      const assigneeDepartmentById = new Map(
        (allowedAssigneeIds || []).map((user: any) => [
          Number(user.id),
          user?.department?.key,
        ])
      );

      if (allowedAssigneeIdSet.size !== requestedAssigneeIds.length) {
        ctx.throw(400, 'One or more assignees are not active helpdesk users');
        return;
      }

      const updates: Array<{ categoryId: number; assigneeIds: number[] }> = [];
      for (const item of categories) {
        const categoryId = Number(item?.id);
        if (!allowedCategoryIds.has(categoryId)) continue;
        const categoryDepartmentKey = categoryDepartmentById.get(categoryId);

        const assigneeIds = Array.from(
          new Set(
            (Array.isArray(item?.assigneeIds) ? item.assigneeIds : [])
              .map((id: any) => Number(id))
              .filter((id: number) => allowedAssigneeIdSet.has(id))
          )
        ) as number[];

        const crossDepartmentAssigneeId = assigneeIds.find((id) => assigneeDepartmentById.get(id) !== categoryDepartmentKey);
        if (crossDepartmentAssigneeId) {
          ctx.throw(400, 'Assignee must belong to the same department as the ticket category');
          return;
        }

        updates.push({ categoryId, assigneeIds });
      }

      for (const update of updates) {
        await strapi.entityService.update('api::ticket-category.ticket-category', update.categoryId, {
          data: {
            defaultAssignee: {
              set: update.assigneeIds.map((id: number) => ({ id })),
            },
          } as any,
        });
      }

      ctx.body = {
        data: await loadHelpdeskRouting(strapi),
        message: 'Helpdesk routing updated successfully',
      };
    } catch (error: any) {
      if (error.status) throw error;
      console.error('Error updating helpdesk routing:', error);
      ctx.throw(500, 'Error updating helpdesk routing');
    }
  },

  async createKeycloakUser(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const {
      username, email, firstName, lastName,
      department, isSuperAdmin, canManageTickets,
    } = ctx.request.body as any;

    if (!username || !email) {
      ctx.throw(400, 'Username and email are required');
      return;
    }

    const { url: keycloakUrl, realm: keycloakRealm } = getKeycloakConfig();

    if (!keycloakUrl) {
      ctx.throw(500, 'Keycloak admin credentials not configured (KEYCLOAK_URL, KEYCLOAK_ADMIN_CLIENT_SECRET)');
      return;
    }

    try {
      const accessToken = await getKeycloakAdminToken(strapi);
      if (!accessToken) {
        ctx.throw(500, 'Failed to get Keycloak admin token');
        return;
      }

      const initialPassword = DEFAULT_KEYCLOAK_INITIAL_PASSWORD;
      const profilePatch = keycloakProfilePatch({
        username,
        email,
        firstName,
        lastName,
        blocked: false,
      });
      const userPayload: any = {
        username: profilePatch.username,
        email: profilePatch.email,
        firstName: profilePatch.firstName,
        lastName: profilePatch.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [{
          type: 'password',
          value: initialPassword,
          temporary: true,
        }],
        requiredActions: [KEYCLOAK_PASSWORD_REQUIRED_ACTION],
      };

      const createRes = await fetch(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(userPayload),
        }
      );

      if (!createRes.ok) {
        if (createRes.status !== 409) {
          const errBody = await createRes.json().catch(() => ({}));
          const errMsg = (errBody as any)?.errorMessage || (errBody as any)?.error || `Keycloak returned ${createRes.status}`;
          strapi.log.error('[keycloak-admin] Create user error:', errMsg);
          ctx.throw(400, `Keycloak: ${errMsg}`);
          return;
        }

        const keycloakUser = await findKeycloakUser(accessToken, { username, email });
        if (!keycloakUser?.id) {
          ctx.throw(400, 'Keycloak user already exists but could not be found');
          return;
        }

        await updateKeycloakProfile(accessToken, keycloakUser, {
          ...profilePatch,
          enabled: true,
          emailVerified: true,
          requiredActions: [KEYCLOAK_PASSWORD_REQUIRED_ACTION],
        });
        await setKeycloakTemporaryPassword(strapi, accessToken, keycloakUser, initialPassword, profilePatch);
      }

      const existingUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email }, { username }] },
      });

      let strapiUser;
      if (existingUsers.length > 0) {
        strapiUser = existingUsers[0];
        strapiUser = await strapi.entityService.update('plugin::users-permissions.user', strapiUser.id, {
          data: {
            email,
            username,
            firstName: firstName || '',
            lastName: lastName || '',
            password: initialPassword,
            department: department || null,
            confirmed: true,
            provider: 'keycloak',
            isSuperAdmin: isSuperAdmin || false,
            canManageTickets: canManageTickets || false,
          },
        });
      } else {
        // Look up the "Authenticated" role dynamically
        const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
        const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
        if (!authenticatedRole) {
          ctx.throw(500, 'Authenticated role not found');
          return;
        }

        strapiUser = await strapi.entityService.create('plugin::users-permissions.user', {
          data: {
            email,
            username,
            firstName: firstName || '',
            lastName: lastName || '',
            password: initialPassword,
            role: authenticatedRole.id,
            department: department || null,
            confirmed: true,
            provider: 'keycloak',
            isSuperAdmin: isSuperAdmin || false,
            canManageTickets: canManageTickets || false,
          },
        });
      }

      const { password: _, ...safeUser } = strapiUser;

      ctx.body = {
        data: safeUser,
        message: 'User created in Keycloak and Strapi with the standard initial password',
        generatedPassword: initialPassword,
        requiresPasswordUpdate: true,
      };
    } catch (error: any) {
      if (error.status) throw error;
      strapi.log.error('[keycloak-admin] Error:', error);
      ctx.throw(500, error.message || 'Error creating Keycloak user');
    }
  },
};
