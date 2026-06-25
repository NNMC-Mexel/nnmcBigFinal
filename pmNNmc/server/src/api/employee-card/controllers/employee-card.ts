import type { Context } from 'koa';
import {
  isEmployeeSyncRunning,
  syncEmployeeCards,
} from '../services/employee-sync';

const CARD_UID = 'api::employee-card.employee-card' as any;
const LOG_UID = 'api::employee-sync-log.employee-sync-log' as any;
const DIRECTORY_DEPARTMENTS = new Set(['HR', 'ACCOUNTING']);

function cleanString(value: any): string {
  return String(value ?? '').trim();
}

function normalizeDepartment(value: any): string {
  return cleanString(value).toLocaleLowerCase('ru');
}

function numericQuery(value: any, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

async function loadCurrentUser(ctx: Context, strapi: any) {
  const user = ctx.state.user;
  if (!user) ctx.throw(401, 'Not authenticated');

  return await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    user.id,
    {
      fields: ['id', 'username', 'firstName', 'lastName', 'isSuperAdmin'],
      populate: ['department'],
    }
  );
}

function canViewDirectory(user: any): boolean {
  return user?.isSuperAdmin === true || DIRECTORY_DEPARTMENTS.has(cleanString(user?.department?.key).toUpperCase());
}

function canSyncDirectory(user: any): boolean {
  return user?.isSuperAdmin === true || cleanString(user?.department?.key).toUpperCase() === 'HR';
}

async function ensureDirectoryAccess(ctx: Context, strapi: any) {
  const user = await loadCurrentUser(ctx, strapi);
  if (!canViewDirectory(user)) {
    ctx.throw(403, 'Employee directory is available only to SuperAdmin, HR and Accounting');
  }
  return user;
}

async function ensureSyncAccess(ctx: Context, strapi: any) {
  const user = await loadCurrentUser(ctx, strapi);
  if (!canSyncDirectory(user)) {
    ctx.throw(403, 'Employee synchronization is available only to SuperAdmin and HR');
  }
  return user;
}

function workplaceMatchesDepartment(workplaces: any[], department: string): boolean {
  if (!department) return true;
  const needle = normalizeDepartment(department);
  return workplaces.some((workplace) => {
    const name = normalizeDepartment(workplace?.department);
    const id = normalizeDepartment(workplace?.departmentId);
    return name.includes(needle) || id === needle;
  });
}

function cardMatchesSearch(card: any, search: string): boolean {
  if (!search) return true;
  const needle = search.toLocaleLowerCase('ru');
  const values = [
    card.iin,
    card.fio,
    card.lastName,
    card.firstName,
    card.middleName,
    ...(Array.isArray(card.workplaces)
      ? card.workplaces.flatMap((workplace: any) => [
          workplace?.personnelNumber,
          workplace?.department,
          workplace?.position,
        ])
      : []),
  ];
  return values.some((value) => cleanString(value).toLocaleLowerCase('ru').includes(needle));
}

function sortWorkplaces(workplaces: any[]): any[] {
  return [...workplaces].sort((left, right) => {
    if (left?.primary === true && right?.primary !== true) return -1;
    if (left?.primary !== true && right?.primary === true) return 1;
    return cleanString(left?.personnelNumber).localeCompare(cleanString(right?.personnelNumber), 'ru');
  });
}

function formatCard(card: any) {
  const workplaces = sortWorkplaces(Array.isArray(card.workplaces) ? card.workplaces : []);
  return {
    id: card.id,
    documentId: card.documentId,
    iin: card.iin,
    physicalPersonId: card.physicalPersonId,
    fio: card.fio,
    lastName: card.lastName,
    firstName: card.firstName,
    middleName: card.middleName,
    birthDate: card.birthDate,
    gender: card.gender,
    nationality: card.nationality,
    active: card.active,
    workplaces,
    primaryWorkplace: workplaces.find((workplace) => workplace?.primary === true) || workplaces[0] || null,
    sourceActualAt: card.sourceActualAt,
    lastSyncedAt: card.lastSyncedAt,
    keycloakStatus: card.keycloakStatus || 'not_created',
    keycloakUserId: card.keycloakUserId || null,
  };
}

export default {
  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    const currentUser = await ensureDirectoryAccess(ctx, strapi);

    const page = numericQuery(ctx.query.page, 1, 1, 100000);
    const pageSize = numericQuery(ctx.query.pageSize, 25, 10, 100);
    const search = cleanString(ctx.query.search);
    const department = cleanString(ctx.query.department);
    const activeQuery = cleanString(ctx.query.active).toLowerCase();
    const active = activeQuery === 'false' ? false : activeQuery === 'all' ? null : true;

    const cards = await strapi.db.query(CARD_UID).findMany({
      orderBy: [{ fio: 'asc' }],
    });
    const departments = Array.from(
      new Set<string>(
        cards.flatMap((card: any) =>
          (Array.isArray(card.workplaces) ? card.workplaces : [])
            .map((workplace: any) => cleanString(workplace?.department))
            .filter(Boolean)
        )
      )
    ).sort((left, right) => left.localeCompare(right, 'ru'));

    const filtered = cards.filter((card: any) => {
      if (active !== null && card.active !== active) return false;
      const workplaces = Array.isArray(card.workplaces) ? card.workplaces : [];
      return cardMatchesSearch(card, search) && workplaceMatchesDepartment(workplaces, department);
    });
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(formatCard);

    ctx.body = {
      items,
      meta: {
        page,
        pageSize,
        count: items.length,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
        departments,
        canSync: canSyncDirectory(currentUser),
      },
    };
  },

  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    await ensureDirectoryAccess(ctx, strapi);
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) ctx.throw(400, 'Invalid employee card id');

    const card = await strapi.db.query(CARD_UID).findOne({ where: { id } });
    if (!card) ctx.throw(404, 'Employee card not found');
    ctx.body = { data: formatCard(card) };
  },

  async sync(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await ensureSyncAccess(ctx, strapi);
    try {
      const result = await syncEmployeeCards(strapi, {
        trigger: 'manual',
        user,
      });
      ctx.body = result;
    } catch (error: any) {
      if (error?.status) ctx.throw(error.status, error.message);
      strapi.log.error(`[employee-sync] Manual synchronization failed: ${error?.message || error}`);
      ctx.throw(502, error?.message || 'Employee synchronization failed');
    }
  },

  async syncStatus(ctx: Context) {
    const strapi = (global as any).strapi;
    await ensureDirectoryAccess(ctx, strapi);
    const latest = await strapi.db.query(LOG_UID).findOne({
      orderBy: [{ startedAt: 'desc' }],
    });

    ctx.body = {
      running: isEmployeeSyncRunning(),
      latest: latest
        ? {
            id: latest.id,
            status: latest.status,
            trigger: latest.trigger,
            triggeredByName: latest.triggeredByName,
            startedAt: latest.startedAt,
            finishedAt: latest.finishedAt,
            sourceActualAt: latest.sourceActualAt,
            source: latest.source,
            stats: latest.stats || {},
            issues: latest.issues || [],
            message: latest.message,
          }
        : null,
    };
  },
};
