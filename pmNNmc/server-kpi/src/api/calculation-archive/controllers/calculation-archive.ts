import { factories } from '@strapi/strapi';
import { getUserAccess } from '../../../utils/access';

const UID = 'api::calculation-archive.calculation-archive' as any;

function canAccessDepartment(access: any, department: string): boolean {
  if (canViewAllArchives(access)) return true;
  return ownArchiveDepartments(access).includes(String(department || '').trim());
}

function canViewAllArchives(access: any): boolean {
  const key = String(access?.departmentKey || '').trim().toUpperCase();
  const name = String(access?.departmentName || '').trim().toLowerCase();
  return (
    access?.isAdmin === true ||
    access?.isSuperAdmin === true ||
    key === 'DIGITALIZATION' ||
    key === 'ECONOMICS' ||
    name.includes('цифров') ||
    name.includes('эконом')
  );
}

function ownArchiveDepartments(access: any): string[] {
  const values = [
    ...(Array.isArray(access?.allowedDepartments) ? access.allowedDepartments : []),
    access?.departmentName,
    access?.departmentKey,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function normalizeEmail(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function archiveOwnerIdentifiers(access: any, user: any): string[] {
  const values = [user?.email, user?.username, access?.userId]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function archiveOwnerFilter(access: any, user: any) {
  const orFilters: any[] = [];
  const userId = Number(access?.userId || user?.id);
  if (Number.isFinite(userId) && userId > 0) {
    orFilters.push({ creator: { id: { $eq: userId } } });
  }
  const identifiers = archiveOwnerIdentifiers(access, user);
  if (identifiers.length > 0) {
    orFilters.push({ creatorEmail: { $in: identifiers.map(normalizeEmail) } });
    orFilters.push({ calculatedBy: { $in: identifiers } });
  }
  return orFilters.length > 0 ? { $or: orFilters } : { id: { $eq: -1 } };
}

function applyAccessFilter(ctx: any, accessFilter: any) {
  ctx.query.filters = ctx.query.filters
    ? { $and: [ctx.query.filters, accessFilter] }
    : accessFilter;
}

async function findArchive(strapi: any, id: any) {
  const rawId = String(id || '');
  if (/^\d+$/.test(rawId)) {
    return await strapi.entityService.findOne(UID, Number(rawId), { populate: ['creator'] });
  }
  return await strapi.documents(UID).findOne({ documentId: rawId, populate: ['creator'] });
}

function canAccessArchive(access: any, user: any, archive: any): boolean {
  if (canViewAllArchives(access)) return true;
  const userId = Number(access?.userId || user?.id);
  const creatorId = Number(archive?.creator?.id || archive?.creator);
  if (Number.isFinite(userId) && userId > 0 && creatorId === userId) return true;

  const identifiers = archiveOwnerIdentifiers(access, user);
  const normalizedIdentifiers = identifiers.map(normalizeEmail);
  return (
    normalizedIdentifiers.includes(normalizeEmail(archive?.creatorEmail)) ||
    identifiers.includes(String(archive?.calculatedBy || '').trim())
  );
}

function pushAuditEvent(strapi: any, payload: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  const token = process.env.INTERNAL_SYNC_TOKEN;
  if (!pmUrl || !token) return;
  fetch(`${pmUrl}/api/internal-audit-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': token,
    },
    body: JSON.stringify(payload),
  }).catch((e: any) => strapi.log?.warn?.(`[audit] failed: ${e?.message || e}`));
}

function snapshotArchive(item: any) {
  if (!item) return null;
  return {
    id: item.id,
    documentId: item.documentId,
    year: item.year,
    month: item.month,
    department: item.department,
    calculatedBy: item.calculatedBy,
    creator: item.creator?.id || item.creator || null,
    creatorEmail: item.creatorEmail || null,
    employeeCount: item.employeeCount,
    edited: item.edited,
  };
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx) {
    const access = await getUserAccess(ctx);
    if (!canViewAllArchives(access)) {
      applyAccessFilter(ctx, archiveOwnerFilter(access, ctx.state.user));
    }
    return await super.find(ctx);
  },

  async findOne(ctx) {
    const access = await getUserAccess(ctx);
    const archive = await findArchive(strapi, ctx.params.id);
    if (!archive) return ctx.notFound('Расчёт не найден');
    if (!canAccessArchive(access, ctx.state.user, archive)) {
      return ctx.forbidden('Нет доступа к этому расчёту');
    }
    ctx.body = { data: archive };
  },

  async create(ctx) {
    const access = await getUserAccess(ctx);
    const data = ctx.request.body?.data || {};
    if (!canAccessDepartment(access, data.department)) {
      return ctx.forbidden('Нет доступа к этому отделу');
    }
    data.creator = ctx.state.user?.id;
    data.creatorEmail = normalizeEmail(ctx.state.user?.email);
    if (!data.calculatedBy) {
      data.calculatedBy = ctx.state.user?.email || ctx.state.user?.username || String(ctx.state.user?.id || '');
    }
    const result: any = await super.create(ctx);
    const created = result?.data || result;
    pushAuditEvent(strapi, {
      action: 'create',
      entityType: UID,
      entityId: String(created?.documentId || created?.id || ''),
      actorEmail: ctx.state.user?.email || null,
      newData: snapshotArchive(created),
    });
    return result;
  },

  async update(ctx) {
    const access = await getUserAccess(ctx);
    const before = await findArchive(strapi, ctx.params.id);
    if (!before) return ctx.notFound('Расчёт не найден');
    if (!canAccessArchive(access, ctx.state.user, before)) {
      return ctx.forbidden('Нет доступа к этому расчёту');
    }
    const nextDepartment = ctx.request.body?.data?.department;
    if (nextDepartment && !canAccessDepartment(access, nextDepartment)) {
      return ctx.forbidden('Нет доступа к указанному отделу');
    }
    const result: any = await super.update(ctx);
    const after = result?.data || result;
    pushAuditEvent(strapi, {
      action: 'update',
      entityType: UID,
      entityId: String(after?.documentId || after?.id || ctx.params.id),
      actorEmail: ctx.state.user?.email || null,
      oldData: snapshotArchive(before),
      newData: snapshotArchive(after),
    });
    return result;
  },

  async delete(ctx) {
    const access = await getUserAccess(ctx);
    const before = await findArchive(strapi, ctx.params.id);
    if (!before) return ctx.notFound('Расчёт не найден');
    if (!canAccessArchive(access, ctx.state.user, before)) {
      return ctx.forbidden('Нет доступа к этому расчёту');
    }
    const result = await super.delete(ctx);
    pushAuditEvent(strapi, {
      action: 'delete',
      entityType: UID,
      entityId: String(before?.documentId || before?.id),
      actorEmail: ctx.state.user?.email || null,
      oldData: snapshotArchive(before),
    });
    return result;
  },
}));
