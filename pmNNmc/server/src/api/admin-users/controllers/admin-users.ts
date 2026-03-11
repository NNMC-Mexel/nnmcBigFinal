import { Context } from 'koa';
import crypto from 'crypto';

// Генерация случайного пароля
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Проверка что пользователь - супер админ
async function checkSuperAdmin(ctx: Context, strapi: any): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
    return false;
  }
  
  // Проверяем роль пользователя
  const userWithRole = await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    populate: ['role'],
  });
  
  const roleName = (userWithRole?.role?.name || '').toLowerCase().replace(/\s+/g, '');
  const roleType = (userWithRole?.role?.type || '').toLowerCase().replace(/\s+/g, '');
  
  console.log('User role check:', { userId: user.id, roleName, roleType, originalName: userWithRole?.role?.name });
  
  // Список разрешенных ролей (без пробелов, lowercase)
  const allowedRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
  
  const isAllowed = allowedRoles.some(role => 
    roleName.includes(role) || roleType.includes(role)
  );
  
  if (!isAllowed) {
    ctx.throw(403, `Access denied. Only Super Admin can manage users. Your role: ${userWithRole?.role?.name || 'none'}`);
    return false;
  }
  
  return true;
}

export default {
  // Получить список всех пользователей
  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    
    await checkSuperAdmin(ctx, strapi);
    
    try {
      const { department, role, search, blocked } = ctx.query;
      
      const filters: any = {};
      
      if (department) {
        filters.department = { key: department };
      }
      
      if (role) {
        filters.role = { id: role };
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
        populate: ['role', 'department'],
        sort: { createdAt: 'desc' },
      });
      
      // Убираем пароли из ответа
      const safeUsers = users.map((user: any) => {
        const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;
        return safeUser;
      });
      
      ctx.body = { data: safeUsers };
    } catch (error) {
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
        populate: ['role', 'department'],
      });
      
      if (!user) {
        ctx.throw(404, 'User not found');
        return;
      }
      
      // Убираем пароль
      const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;
      
      ctx.body = { data: safeUser };
    } catch (error) {
      console.error('Error fetching user:', error);
      ctx.throw(500, 'Error fetching user');
    }
  },

  // Создать пользователя
  async create(ctx: Context) {
    const strapi = (global as any).strapi;
    
    await checkSuperAdmin(ctx, strapi);
    
    const { email, username, firstName, lastName, role, department, blocked, generatePasswordAuto } = ctx.request.body as any;
    
    if (!email || !username) {
      ctx.throw(400, 'Email and username are required');
      return;
    }
    
    try {
      // Проверяем уникальность
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
      
      // Генерируем или используем переданный пароль
      const password = generatePasswordAuto ? generatePassword() : (ctx.request.body as any).password;
      
      if (!password) {
        ctx.throw(400, 'Password is required');
        return;
      }
      
      const user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          email,
          username,
          firstName: firstName || '',
          lastName: lastName || '',
          password,
          role: role || 1, // Default role
          department: department || null,
          blocked: blocked || false,
          confirmed: true, // Автоподтверждение при создании админом
          provider: 'local',
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
    const { firstName, lastName, role, department, blocked, moduleAccess } = ctx.request.body as any;

    try {
      const updateData: any = {};

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role !== undefined) updateData.role = role;
      if (department !== undefined) updateData.department = department;
      if (blocked !== undefined) updateData.blocked = blocked;
      if (moduleAccess !== undefined) updateData.moduleAccess = moduleAccess;
      
      const user = await strapi.entityService.update('plugin::users-permissions.user', id, {
        data: updateData,
        populate: ['role', 'department'],
      });
      
      const { password, resetPasswordToken, confirmationToken, ...safeUser } = user;
      
      ctx.body = {
        data: safeUser,
        message: 'User updated successfully',
      };
    } catch (error) {
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
        newPassword: password, // Показываем новый пароль админу
      };
    } catch (error) {
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
      // Не позволяем удалить самого себя
      if (ctx.state.user.id === parseInt(id)) {
        ctx.throw(400, 'Cannot delete yourself');
        return;
      }
      
      await strapi.entityService.delete('plugin::users-permissions.user', id);
      
      ctx.body = {
        message: 'User deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting user:', error);
      ctx.throw(500, 'Error deleting user');
    }
  },

  // Получить список ролей
  async getRoles(ctx: Context) {
    const strapi = (global as any).strapi;

    await checkSuperAdmin(ctx, strapi);

    try {
      const roles = await strapi.entityService.findMany('plugin::users-permissions.role', {});

      ctx.body = { data: roles };
    } catch (error) {
      console.error('Error fetching roles:', error);
      ctx.throw(500, 'Error fetching roles');
    }
  },

  // Создать пользователя в Keycloak + Strapi
  async createKeycloakUser(ctx: Context) {
    const strapi = (global as any).strapi;

    await checkSuperAdmin(ctx, strapi);

    const {
      username, email, firstName, lastName,
      password, role, department, moduleAccess,
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
          temporary: true, // User must change on first login
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

      // 3. Also create user in Strapi (so they have a local account for module access, etc.)
      const tempPassword = password || generatePassword();

      // Check if user already exists in Strapi
      const existingUsers = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { $or: [{ email }, { username }] },
      });

      let strapiUser;
      if (existingUsers.length > 0) {
        strapiUser = existingUsers[0];
        // Update moduleAccess if provided
        if (moduleAccess) {
          await strapi.entityService.update('plugin::users-permissions.user', strapiUser.id, {
            data: { moduleAccess },
          });
        }
      } else {
        strapiUser = await strapi.entityService.create('plugin::users-permissions.user', {
          data: {
            email,
            username,
            firstName: firstName || '',
            lastName: lastName || '',
            password: tempPassword,
            role: role || 1,
            department: department || null,
            moduleAccess: moduleAccess || [],
            confirmed: true,
            provider: 'keycloak',
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
      if (error.status) throw error; // Re-throw ctx.throw errors
      strapi.log.error('[keycloak-admin] Error:', error);
      ctx.throw(500, error.message || 'Error creating Keycloak user');
    }
  },
};
