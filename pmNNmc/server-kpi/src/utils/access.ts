import type { Context } from 'koa';

declare const strapi: any;

type UserAccess = {
  isAdmin: boolean;
  isSuperAdmin?: boolean;
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

export async function requireCorporateKpiOneCAccess(ctx: Context): Promise<void> {
  const authorization = String(ctx.get('x-pm-authorization') || '').trim();
  const pmUrl = String(process.env.SERVER_PM_URL || '').trim().replace(/\/+$/, '');
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    ctx.throw(401, 'Не найдена активная сессия корпоративной системы');
  }
  if (!pmUrl) {
    ctx.throw(503, 'Не настроен адрес основной корпоративной системы');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${pmUrl}/api/users/me?populate=department`, {
      signal: controller.signal,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
    });
    if (response.status === 401 || response.status === 403) {
      ctx.throw(401, 'Сессия корпоративной системы истекла');
    }
    if (!response.ok) {
      ctx.throw(502, `Основная корпоративная система вернула HTTP ${response.status}`);
    }

    const pmUser: any = await response.json();
    const departmentKey = String(pmUser?.department?.key || '').trim().toUpperCase();
    const departmentName = String(
      pmUser?.department?.name_ru || pmUser?.department?.name_kz || ''
    ).trim().toLowerCase();
    const isAllowed =
      pmUser?.isSuperAdmin === true ||
      departmentKey === 'ACCOUNTING' ||
      departmentName.includes('бухгалтер');

    if (!isAllowed) {
      ctx.throw(403, 'Отправлять итоговый KPI в 1С могут только супер-администраторы и сотрудники бухгалтерии');
    }
  } catch (error: any) {
    if (error?.status) throw error;
    if (error?.name === 'AbortError') {
      ctx.throw(504, 'Основная корпоративная система не ответила вовремя');
    }
    ctx.throw(502, 'Не удалось проверить права в основной корпоративной системе');
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
  const isAdminAccess =
    isSuperAdmin ||
    isAdminRole(roleName) ||
    isAdminLogin(user) ||
    hasGlobalDepartmentAccess(departmentKey, departmentName);

  return {
    isAdmin: isAdminAccess,
    isSuperAdmin,
    roleName,
    allowedDepartments: normalized,
    userId: user.id,
    departmentKey,
    departmentName,
    isKpiResponsible,
  };
}
