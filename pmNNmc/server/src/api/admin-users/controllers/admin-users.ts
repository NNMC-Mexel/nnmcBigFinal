import { Context } from 'koa';
import crypto from 'crypto';

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

function sanitizeFields(data: Record<string, any>, allowlist: string[]): Record<string, any> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => allowlist.includes(k)));
}

// Генерация случайного пароля (криптографически безопасная)
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(bytes[i] % chars.length);
  }
  return password;
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
      email, username, firstName, lastName, department, blocked, generatePasswordAuto, isSuperAdmin,
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

      const password = generatePasswordAuto ? generatePassword() : (ctx.request.body as any).password;
      if (!password) {
        ctx.throw(400, 'Password is required');
        return;
      }

      // Use the default "Authenticated" role (id=1)
      const user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          email,
          username,
          firstName: firstName || '',
          lastName: lastName || '',
          password,
          role: 1,
          department: department || null,
          blocked: blocked || false,
          confirmed: true,
          provider: 'local',
          isSuperAdmin: isSuperAdmin || false,
        },
      });

      const { password: _, ...safeUser } = user;

      ctx.body = {
        data: safeUser,
        generatedPassword: generatePasswordAuto ? password : null,
        message: 'User created successfully',
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
    const { firstName, lastName, department, blocked, isSuperAdmin } = ctx.request.body as any;

    try {
      const updateData: any = {};

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (department !== undefined) updateData.department = department;
      if (blocked !== undefined) updateData.blocked = blocked;
      if (isSuperAdmin !== undefined) updateData.isSuperAdmin = isSuperAdmin;

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
    const { newPassword, generateNew } = ctx.request.body as any;

    try {
      const password = generateNew ? generatePassword() : newPassword;

      if (!password) {
        ctx.throw(400, 'Password is required');
        return;
      }

      await strapi.entityService.update('plugin::users-permissions.user', id, {
        data: { password },
      });

      ctx.body = {
        message: 'Password reset successfully',
        newPassword: generateNew ? password : undefined,
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
  async createKeycloakUser(ctx: Context) {
    const strapi = (global as any).strapi;
    await checkSuperAdmin(ctx, strapi);

    const {
      username, email, firstName, lastName,
      password, department, isSuperAdmin,
    } = ctx.request.body as any;

    if (!username || !email) {
      ctx.throw(400, 'Username and email are required');
      return;
    }

    const keycloakUrl = process.env.KEYCLOAK_URL;
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'nnmc';
    const adminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
    const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

    if (!keycloakUrl || !adminClientSecret) {
      ctx.throw(500, 'Keycloak admin credentials not configured (KEYCLOAK_URL, KEYCLOAK_ADMIN_CLIENT_SECRET)');
      return;
    }

    try {
      // 1. Get admin access token via client credentials
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
        const err = await tokenRes.text();
        strapi.log.error('[keycloak-admin] Token error:', err);
        ctx.throw(500, 'Failed to get Keycloak admin token');
        return;
      }

      const { access_token } = await tokenRes.json() as any;

      // 2. Create user in Keycloak
      const userPayload: any = {
        username,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        enabled: true,
        emailVerified: true,
      };

      if (password) {
        userPayload.credentials = [{
          type: 'password',
          value: password,
          temporary: true,
        }];
      }

      const createRes = await fetch(
        `${keycloakUrl}/admin/realms/${keycloakRealm}/users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify(userPayload),
        }
      );

      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({}));
        const errMsg = (errBody as any)?.errorMessage || (errBody as any)?.error || `Keycloak returned ${createRes.status}`;
        strapi.log.error('[keycloak-admin] Create user error:', errMsg);
        ctx.throw(400, `Keycloak: ${errMsg}`);
        return;
      }

      // 3. Create user in Strapi
      const tempPassword = password || generatePassword();

      const existingUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email }, { username }] },
      });

      let strapiUser;
      if (existingUsers.length > 0) {
        strapiUser = existingUsers[0];
        await strapi.entityService.update('plugin::users-permissions.user', strapiUser.id, {
          data: {
            department: department || null,
            isSuperAdmin: isSuperAdmin || false,
          },
        });
      } else {
        strapiUser = await strapi.entityService.create('plugin::users-permissions.user', {
          data: {
            email,
            username,
            firstName: firstName || '',
            lastName: lastName || '',
            password: tempPassword,
            role: 1,
            department: department || null,
            confirmed: true,
            provider: 'keycloak',
            isSuperAdmin: isSuperAdmin || false,
          },
        });
      }

      const { password: _, ...safeUser } = strapiUser;

      ctx.body = {
        data: safeUser,
        message: 'User created in Keycloak and Strapi',
        generatedPassword: !password ? tempPassword : null,
      };
    } catch (error: any) {
      if (error.status) throw error;
      strapi.log.error('[keycloak-admin] Error:', error);
      ctx.throw(500, error.message || 'Error creating Keycloak user');
    }
  },
};
