import type { Context } from 'koa';

declare const strapi: any;

type UserAccess = {
  isAdmin: boolean;
  roleName: string;
  allowedDepartments: string[];
  userId?: number;
  departmentKey?: string;
  departmentName?: string;
  isKpiResponsible?: boolean;
};

const ADMIN_ROLE_HINTS = ['admin', 'administrator', 'super admin', 'superadmin'];

function normalizeDepartments(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((d) => String(d || '').trim())
    .filter((d) => d.length > 0);
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

function hasGlobalDepartmentAccess(departmentKey: string): boolean {
  const normalized = String(departmentKey || '').trim().toUpperCase();
  return normalized === 'ACCOUNTING' || normalized === 'DIGITALIZATION';
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

  let normalized = allowedDepartments || [];
  if (isKpiResponsible && departmentKey && !normalized.includes(departmentKey)) {
    normalized.push(departmentKey);
  }
  const isAdminAccess =
    isSuperAdmin ||
    isAdminRole(roleName) ||
    isAdminLogin(user) ||
    hasGlobalDepartmentAccess(departmentKey);
  if (!isAdminAccess && !isKpiResponsible) {
    normalized = [];
  }

  return {
    isAdmin: isAdminAccess,
    roleName,
    allowedDepartments: normalized,
    userId: user.id,
    departmentKey,
    departmentName,
    isKpiResponsible,
  };
}
