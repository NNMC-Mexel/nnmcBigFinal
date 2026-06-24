import type { Context } from 'koa';

declare const strapi: any;

export type UserAccess = {
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  isPrivilegedAdmin?: boolean;
  roleName: string;
  allowedDepartments: string[];
  userId?: number;
  departmentKey?: string;
  departmentName?: string;
  isKpiResponsible?: boolean;
};

const ADMIN_ROLE_HINTS = ['admin', 'administrator', 'super admin', 'superadmin'];
const ACCOUNTING_DEPARTMENT_KEYS = new Set(['ACCOUNTING']);

function normalizeDepartments(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((d) => String(d || '').trim())
    .filter((d) => d.length > 0);
}

function pushUnique(list: string[], value: any) {
  const item = String(value || '').trim();
  if (item && !list.includes(item)) {
    list.push(item);
  }
}

function isAdminRole(roleName: string): boolean {
  const lowered = String(roleName || '').toLowerCase();
  if (!lowered) return false;
  return ADMIN_ROLE_HINTS.some((hint) => lowered === hint || lowered.includes(hint));
}

function isAdminLogin(user: any): boolean {
  const username = String(user?.username || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  return (
    username === 'admin-nnmc' ||
    username === 'admin' ||
    email === 'admin@nnmc.kz' ||
    email.startsWith('admin@') ||
    email.includes('.admin@')
  );
}

function isAccountingAccess(access: UserAccess): boolean {
  const departmentKey = String(access.departmentKey || '').trim().toUpperCase();
  const departmentName = String(access.departmentName || '').trim().toLowerCase();
  const roleName = String(access.roleName || '').trim().toLowerCase();

  return (
    ACCOUNTING_DEPARTMENT_KEYS.has(departmentKey) ||
    departmentName.includes('бухгалтер') ||
    roleName.includes('бухгалтер') ||
    roleName.includes('accountant')
  );
}

export function canSendKpiToOneC(access: UserAccess): boolean {
  return access.isPrivilegedAdmin === true || isAccountingAccess(access);
}

export async function refreshCurrentUserAccessFromPm(ctx: Context): Promise<void> {
  const user = (ctx.state as any)?.user;
  const email = String(user?.email || '').trim().toLowerCase();
  const pmUrl = String(process.env.SERVER_PM_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.INTERNAL_SYNC_TOKEN || '').trim();
  if (!user?.id || !email || !pmUrl || !token) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${pmUrl}/api/internal-sync/users`, {
      signal: controller.signal,
      headers: { 'X-Internal-Token': token },
    });
    if (!response.ok) return;

    const users = await response.json();
    if (!Array.isArray(users)) return;
    const pmUser = users.find((item: any) => String(item?.email || '').trim().toLowerCase() === email);
    if (!pmUser) return;

    const patch = {
      isSuperAdmin: Boolean(pmUser?.isSuperAdmin),
      isKpiResponsible: Boolean(pmUser?.isKpiResponsible),
      departmentKey: String(pmUser?.department?.key || '').trim(),
      departmentName: String(pmUser?.department?.name_ru || '').trim(),
    };

    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
      data: patch,
    });
    Object.assign(user, patch);
  } catch {
    // The last synchronized local access data remains the fallback.
  } finally {
    clearTimeout(timer);
  }
}

function hasGlobalDepartmentAccess(departmentKey: string, departmentName = ''): boolean {
  const normalized = String(departmentKey || '').trim().toUpperCase();
  const name = String(departmentName || '').trim().toLowerCase();
  return (
    normalized === 'DIGITALIZATION' ||
    normalized === 'ECONOMICS' ||
    name.includes('цифров') ||
    name.includes('эконом')
  );
}

export async function getUserAccess(ctx: Context): Promise<UserAccess> {
  const user = (ctx.state as any)?.user;
  if (!user) {
    return { isAdmin: false, roleName: '', allowedDepartments: [] };
  }

  let roleName = '';
  let allowedDepartments: string[] | null = null;
  let isSuperAdmin = Boolean((user as any)?.isSuperAdmin);
  let isKpiResponsible = Boolean((user as any)?.isKpiResponsible);
  let departmentKey = String((user as any)?.departmentKey || '').trim();
  let departmentName = String((user as any)?.departmentName || '').trim();

  if (user.role && typeof user.role === 'object') {
    roleName = String(user.role.name || user.role.type || '');
  }

  if (Array.isArray(user.allowedDepartments)) {
    allowedDepartments = normalizeDepartments(user.allowedDepartments);
  }

  if (!roleName || allowedDepartments === null || !isSuperAdmin || !departmentKey || !departmentName || !isKpiResponsible) {
    const fullUser = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['role'] }
    );

    if (!roleName) {
      roleName = String(fullUser?.role?.name || fullUser?.role?.type || '');
    }

    if (allowedDepartments === null) {
      allowedDepartments = normalizeDepartments(fullUser?.allowedDepartments);
    }

    if (!isSuperAdmin) {
      isSuperAdmin = Boolean(fullUser?.isSuperAdmin);
    }

    if (!isKpiResponsible) {
      isKpiResponsible = Boolean(fullUser?.isKpiResponsible);
    }

    if (!departmentKey) {
      departmentKey = String(fullUser?.departmentKey || '').trim();
    }

    if (!departmentName) {
      departmentName = String(fullUser?.departmentName || '').trim();
    }
  }

  let normalized = [...(allowedDepartments || [])];
  if (isKpiResponsible) {
    pushUnique(normalized, departmentKey);
    pushUnique(normalized, departmentName);
  }
  const isPrivilegedAdmin =
    isSuperAdmin ||
    isAdminRole(roleName) ||
    isAdminLogin(user);
  const isAdminAccess =
    isPrivilegedAdmin ||
    hasGlobalDepartmentAccess(departmentKey, departmentName);

  return {
    isAdmin: isAdminAccess,
    isSuperAdmin,
    isPrivilegedAdmin,
    roleName,
    allowedDepartments: normalized,
    userId: user.id,
    departmentKey,
    departmentName,
    isKpiResponsible,
  };
}
