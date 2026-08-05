import type { Context } from 'koa';
import { evaluateProjectFormula, validateProjectFormula } from '../../../utils/project-calculation-formula';

declare const strapi: any;

const PROJECT_UID = 'api::project-calculation.project-calculation';
const SETTINGS_UID = 'api::project-calculation-setting.project-calculation-setting';
const USER_UID = 'plugin::users-permissions.user';
const DEPARTMENT_UID = 'api::department.department';
const UPLOAD_FILE_UID = 'plugin::upload.file';

const DEFAULT_REVIEWER_EMAIL = 'aigul.b@nnmc.kz';
const DEFAULT_ACTUAL_FORMULA = '(market - actual) * margin / employeeCount';
const DEFAULT_AI_FORMULA = '(market - ai) * margin / employeeCount';
const DEFAULT_MARGIN = 0.3;
const ALWAYS_ALLOWED_EMAILS = new Set(['kuat@nnmc.kz']);
const EXTRA_COST_CATEGORIES = new Set(['licenses', 'infrastructure', 'travel', 'contractors', 'purchases']);
const EDITABLE_STATUSES = new Set(['DRAFT', 'RETURNED']);
const REVIEWABLE_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW']);

const POPULATE = {
  creator: { fields: ['id', 'username', 'email', 'firstName', 'lastName', 'position'], populate: { department: true } },
  department: { fields: ['id', 'key', 'name_ru', 'name_kz'] },
  teamMembers: { fields: ['id', 'username', 'email', 'firstName', 'lastName', 'position'], populate: { department: true } },
  reviewer: { fields: ['id', 'username', 'email', 'firstName', 'lastName'] },
  aiReportFiles: { fields: ['id', 'name', 'url', 'mime', 'size', 'ext'] },
  marketFiles: { fields: ['id', 'name', 'url', 'mime', 'size', 'ext'] },
};

type Access = {
  user: any;
  settings: any;
  isSuperAdmin: boolean;
  isReviewer: boolean;
  canCreate: boolean;
  canViewDepartment: boolean;
  departmentSetting: any | null;
};

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: any): number {
  return Math.round(numberValue(value) * 100) / 100;
}

function normalizedEmail(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function userName(user: any): string {
  const name = [user?.lastName, user?.firstName].filter(Boolean).join(' ').trim();
  return name || user?.username || user?.email || `Пользователь ${user?.id || ''}`;
}

function dateCode(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')}${get('month')}${get('year')}`;
}

function departmentCode(value: any): string {
  const code = String(value || 'DEP').trim().toUpperCase().replace(/[^A-ZА-ЯЁ0-9_-]/g, '').slice(0, 12);
  return code || 'DEP';
}

function relationId(value: any): number | null {
  const id = Number(value?.id ?? value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function relationIds(value: any): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(relationId).filter((id): id is number => id != null)));
}

function fileIds(value: any): number[] {
  return relationIds(value);
}

async function validateAttachedFiles(ids: number[], label: string): Promise<string | null> {
  if (ids.length === 0) return null;
  const files = await strapi.db.query(UPLOAD_FILE_UID).findMany({
    where: { id: { $in: ids } },
    select: ['id', 'name', 'ext', 'mime'],
  });
  if (files.length !== ids.length) return `${label}: один или несколько файлов не найдены`;
  const invalid = files.find((file: any) => {
    const identity = `${file?.name || ''} ${file?.ext || ''} ${file?.mime || ''}`.toLowerCase();
    return !/(\.pdf|\.docx?\b|application\/pdf|application\/msword|wordprocessingml)/.test(identity);
  });
  return invalid ? `${label}: допустимы только PDF, DOC и DOCX` : null;
}

async function validateProjectFiles(input: any): Promise<string | null> {
  return (await validateAttachedFiles(input.aiReportFiles || [], 'Отчёт ИИ'))
    || (await validateAttachedFiles(input.marketFiles || [], 'Рыночная оценка'));
}

function cleanProject(project: any): any {
  if (!project) return project;
  const result = { ...project };
  delete result.formulaSnapshot;
  return result;
}

function sanitizeCosts(value: any): any[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id || '').trim() || undefined,
      category: String(item?.category || '').trim(),
      description: String(item?.description || '').trim(),
      amount: money(Math.max(0, numberValue(item?.amount))),
    }))
    .filter((item) => EXTRA_COST_CATEGORIES.has(item.category) && (item.amount > 0 || item.description));
}

function costsTotal(costs: any[]): number {
  return money(costs.reduce((sum, item) => sum + numberValue(item?.amount), 0));
}

function appendHistory(project: any, action: string, actor: any, comment?: string): any[] {
  const history = Array.isArray(project?.history) ? [...project.history] : [];
  history.push({
    action,
    status: project?.status,
    actorId: actor?.id,
    actorName: userName(actor),
    actorEmail: actor?.email || null,
    comment: String(comment || '').trim() || null,
    at: new Date().toISOString(),
  });
  return history;
}

function versionSnapshot(project: any): any {
  return {
    requestNumber: project.requestNumber,
    version: project.version,
    status: project.status,
    title: project.title,
    description: project.description,
    customer: project.customer,
    startDate: project.startDate,
    endDate: project.endDate,
    teamSnapshot: project.teamSnapshot,
    hourlyRate: numberValue(project.hourlyRate),
    actualHours: numberValue(project.actualHours),
    actualExtraCosts: project.actualExtraCosts || [],
    actualTotal: numberValue(project.actualTotal),
    aiHours: numberValue(project.aiHours),
    aiExtraCosts: project.aiExtraCosts || [],
    aiTotal: numberValue(project.aiTotal),
    marketAmount: numberValue(project.marketAmount),
    actualEfficiencyPerEmployee: numberValue(project.actualEfficiencyPerEmployee),
    aiEfficiencyPerEmployee: numberValue(project.aiEfficiencyPerEmployee),
    submittedAt: project.submittedAt,
    snapshottedAt: new Date().toISOString(),
  };
}

async function loadUser(userId: number): Promise<any> {
  return strapi.db.query(USER_UID).findOne({
    where: { id: Number(userId) },
    populate: { department: true },
  });
}

async function getSettings(): Promise<any> {
  let settings = await strapi.db.query(SETTINGS_UID).findOne({ where: { key: 'default' } });
  if (!settings) settings = await strapi.db.query(SETTINGS_UID).findOne({ where: {} });
  if (settings) {
    if (settings.key !== 'default') {
      settings = await strapi.db.query(SETTINGS_UID).update({
        where: { id: settings.id },
        data: { key: 'default' },
      });
    }
    return settings;
  }

  const departments = await strapi.db.query(DEPARTMENT_UID).findMany({ orderBy: { name_ru: 'asc' } });
  const initialDepartments = departments.map((department: any) => {
    const identity = `${department.key || ''} ${department.name_ru || ''}`.toLowerCase();
    return {
      departmentId: Number(department.id),
      enabled: ['IT', 'DIGITALIZATION', 'DEVELOPMENT'].includes(String(department.key || '').toUpperCase())
        || /цифр|разработ|информационн.*технолог/.test(identity),
      code: departmentCode(department.key),
      hourlyRate: 0,
    };
  });
  const kuat = await strapi.db.query(USER_UID).findOne({ where: { email: 'kuat@nnmc.kz' } });
  try {
    settings = await strapi.db.query(SETTINGS_UID).create({
      data: {
        key: 'default',
        reviewerEmail: DEFAULT_REVIEWER_EMAIL,
        margin: DEFAULT_MARGIN,
        actualFormula: DEFAULT_ACTUAL_FORMULA,
        aiFormula: DEFAULT_AI_FORMULA,
        departmentSettings: initialDepartments,
        userAccessRules: kuat ? [{ userId: Number(kuat.id), canCreate: true, canViewDepartment: true }] : [],
      },
    });
  } catch (error) {
    settings = await strapi.db.query(SETTINGS_UID).findOne({ where: { key: 'default' } });
    if (!settings) throw error;
  }
  return settings;
}

function getDepartmentSetting(settings: any, departmentId: any): any | null {
  const id = Number(departmentId);
  return (Array.isArray(settings?.departmentSettings) ? settings.departmentSettings : [])
    .find((item: any) => Number(item?.departmentId) === id) || null;
}

function getUserRule(settings: any, userId: any): any | null {
  const id = Number(userId);
  return (Array.isArray(settings?.userAccessRules) ? settings.userAccessRules : [])
    .find((item: any) => Number(item?.userId) === id) || null;
}

async function getAccess(userId: number): Promise<Access> {
  const [user, settings] = await Promise.all([loadUser(userId), getSettings()]);
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const departmentSetting = getDepartmentSetting(settings, user?.department?.id);
  const userRule = getUserRule(settings, userId);
  const email = normalizedEmail(user?.email);
  const isReviewer = email === normalizedEmail(settings?.reviewerEmail || DEFAULT_REVIEWER_EMAIL);
  const hasDepartmentMatrixAccess = user?.department?.canAccessProjectCalculations === true;
  return {
    user,
    settings,
    isSuperAdmin,
    isReviewer,
    canCreate: isSuperAdmin || ALWAYS_ALLOWED_EMAILS.has(email) || hasDepartmentMatrixAccess || Boolean(departmentSetting?.enabled) || Boolean(userRule?.canCreate),
    canViewDepartment: isSuperAdmin || Boolean(userRule?.canViewDepartment),
    departmentSetting,
  };
}

async function findReviewer(settings: any): Promise<any | null> {
  const email = normalizedEmail(settings?.reviewerEmail || DEFAULT_REVIEWER_EMAIL);
  if (!email) return null;
  return strapi.db.query(USER_UID).findOne({ where: { email: { $eqi: email } } });
}

async function loadProject(id: any): Promise<any> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  return strapi.entityService.findOne(PROJECT_UID, numericId, { populate: POPULATE as any });
}

function isParticipant(project: any, userId: number): boolean {
  return relationIds(project?.teamMembers).includes(Number(userId));
}

function canViewProject(project: any, access: Access): boolean {
  if (access.isSuperAdmin || access.isReviewer) return true;
  if (relationId(project?.creator) === Number(access.user.id)) return true;
  if (isParticipant(project, access.user.id)) return true;
  return access.canViewDepartment && relationId(project?.department) === relationId(access.user?.department);
}

function canEditProject(project: any, access: Access): boolean {
  if (!EDITABLE_STATUSES.has(project?.status)) return false;
  return access.isSuperAdmin || relationId(project?.creator) === Number(access.user.id);
}

function canReviewProject(project: any, access: Access): boolean {
  return (access.isSuperAdmin || access.isReviewer) && REVIEWABLE_STATUSES.has(project?.status);
}

async function nextNumber(department: any, settings: any, version = 1): Promise<{ requestNumber: string; numberDate: string; sequenceNumber: number }> {
  const codeDate = dateCode();
  const setting = getDepartmentSetting(settings, department?.id);
  const code = departmentCode(setting?.code || department?.key);
  const last = await strapi.db.query(PROJECT_UID).findOne({
    where: { numberDate: codeDate, department: { id: Number(department.id) } },
    orderBy: { sequenceNumber: 'desc' },
  });
  let sequenceNumber = Number(last?.sequenceNumber || 0) + 1;
  let requestNumber = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    requestNumber = `${codeDate}-${code}-${String(sequenceNumber).padStart(4, '0')}-${String(version).padStart(2, '0')}`;
    const exists = await strapi.db.query(PROJECT_UID).findOne({ where: { requestNumber } });
    if (!exists) break;
    sequenceNumber += 1;
  }
  return { requestNumber, numberDate: codeDate, sequenceNumber };
}

async function sanitizeTeam(rawTeam: any, departmentId: number, access: Access): Promise<{ ids: number[]; snapshot: any[] }> {
  const entries = Array.isArray(rawTeam) ? rawTeam : [];
  const roles = new Map<number, string>();
  entries.forEach((entry: any) => {
    const id = relationId(entry?.userId ?? entry?.id ?? entry);
    if (id) roles.set(id, String(entry?.role || '').trim());
  });
  const ids = Array.from(roles.keys());
  if (ids.length === 0) return { ids: [], snapshot: [] };

  const users = await strapi.db.query(USER_UID).findMany({
    where: { id: { $in: ids }, blocked: false },
    populate: { department: true },
  });
  const validUsers = users.filter((user: any) => access.isSuperAdmin || relationId(user.department) === Number(departmentId));
  return {
    ids: validUsers.map((user: any) => Number(user.id)),
    snapshot: validUsers.map((user: any) => ({
      userId: Number(user.id),
      name: userName(user),
      email: user.email || null,
      position: user.position || null,
      role: roles.get(Number(user.id)) || '',
    })),
  };
}

function calculatedFields(input: any, settings: any): any {
  const hourlyRate = money(Math.max(0, numberValue(input.hourlyRate)));
  const actualHours = Math.max(0, numberValue(input.actualHours));
  const aiHours = Math.max(0, numberValue(input.aiHours));
  const actualExtraCosts = sanitizeCosts(input.actualExtraCosts);
  const aiExtraCosts = sanitizeCosts(input.aiExtraCosts);
  const actualTotal = money(actualHours * hourlyRate + costsTotal(actualExtraCosts));
  const aiTotal = money(aiHours * hourlyRate + costsTotal(aiExtraCosts));
  const marketAmount = money(Math.max(0, numberValue(input.marketAmount)));
  const employeeCount = Array.isArray(input.teamSnapshot) ? input.teamSnapshot.length : 0;
  const margin = numberValue(settings?.margin, DEFAULT_MARGIN);
  const actualFormula = String(settings?.actualFormula || DEFAULT_ACTUAL_FORMULA);
  const aiFormula = String(settings?.aiFormula || DEFAULT_AI_FORMULA);

  let actualEfficiencyPerEmployee = 0;
  let aiEfficiencyPerEmployee = 0;
  if (employeeCount > 0) {
    const values = { market: marketAmount, actual: actualTotal, ai: aiTotal, margin, employeeCount };
    actualEfficiencyPerEmployee = money(evaluateProjectFormula(actualFormula, values));
    aiEfficiencyPerEmployee = money(evaluateProjectFormula(aiFormula, values));
  }

  return {
    hourlyRate,
    actualHours,
    actualExtraCosts,
    actualTotal,
    aiHours,
    aiExtraCosts,
    aiTotal,
    marketAmount,
    actualEfficiencyPerEmployee,
    aiEfficiencyPerEmployee,
    formulaSnapshot: { margin, actualFormula, aiFormula },
  };
}

async function audit(action: string, project: any, actor: any, oldData?: any, newData?: any): Promise<void> {
  try {
    await strapi.entityService.create('api::audit-event.audit-event', {
      data: {
        actor: actor.id,
        actorEmail: actor.email || null,
        action,
        entityType: 'project-calculation',
        entityId: String(project?.id || 'settings'),
        oldData: oldData || null,
        newData: newData || null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    strapi.log.warn(`[project-calculation] audit failed: ${error?.message || error}`);
  }
}

async function notify(userId: any, title: string, body: string, projectId: number): Promise<void> {
  if (!userId) return;
  try {
    await strapi.entityService.create('api::notification.notification', {
      data: {
        recipient: Number(userId),
        title,
        body,
        type: 'project-calculation',
        link: `/app/project-calculations/${projectId}`,
        isRead: false,
      },
    });
  } catch (error: any) {
    strapi.log.warn(`[project-calculation] notification failed: ${error?.message || error}`);
  }
}

function payload(ctx: Context): any {
  return (ctx.request as any).body?.data ?? (ctx.request as any).body ?? {};
}

function projectInput(raw: any): any {
  return {
    title: String(raw?.title || '').trim(),
    description: String(raw?.description || '').trim() || null,
    customer: String(raw?.customer || '').trim() || null,
    startDate: raw?.startDate || null,
    endDate: raw?.endDate || null,
    actualHours: Math.max(0, numberValue(raw?.actualHours)),
    actualExtraCosts: sanitizeCosts(raw?.actualExtraCosts),
    aiHours: Math.max(0, numberValue(raw?.aiHours)),
    aiExtraCosts: sanitizeCosts(raw?.aiExtraCosts),
    marketAmount: Math.max(0, numberValue(raw?.marketAmount)),
    aiReportFiles: fileIds(raw?.aiReportFileIds ?? raw?.aiReportFiles),
    marketFiles: fileIds(raw?.marketFileIds ?? raw?.marketFiles),
  };
}

function validateForSubmission(project: any): string | null {
  if (!String(project?.title || '').trim() || project.title === 'Новый расчёт проекта') return 'Укажите название проекта';
  if (!String(project?.customer || '').trim()) return 'Укажите заказчика';
  if (!project?.startDate || !project?.endDate) return 'Укажите сроки проекта';
  if (String(project.startDate) > String(project.endDate)) return 'Дата окончания не может быть раньше даты начала';
  if (!Array.isArray(project?.teamSnapshot) || project.teamSnapshot.length === 0) return 'Добавьте участников проекта';
  if (project.teamSnapshot.some((member: any) => !String(member?.role || '').trim())) return 'Укажите роль каждого участника проекта';
  if (numberValue(project?.hourlyRate) <= 0) return 'Супер-администратор ещё не настроил стоимость часа для подразделения';
  if (numberValue(project?.actualHours) <= 0) return 'Укажите фактические человеко-часы проекта';
  if (numberValue(project?.aiTotal) <= 0) return 'Заполните оценку проекта по ИИ';
  if (numberValue(project?.marketAmount) <= 0) return 'Укажите рыночную оценку проекта';
  return null;
}

async function changeProjectStatus(
  ctx: Context,
  nextStatus: string,
  action: string,
  commentRequired: boolean,
) {
  const authUser = (ctx.state as any).user;
  if (!authUser) return ctx.unauthorized('Необходима авторизация');
  const [access, project] = await Promise.all([getAccess(authUser.id), loadProject(ctx.params.id)]);
  if (!project) return ctx.notFound('Расчёт проекта не найден');
  if (!canReviewProject(project, access)) return ctx.forbidden('Нет права согласовывать этот расчёт');
  if (action === 'REVIEW_STARTED' && project.status !== 'SUBMITTED') {
    return ctx.badRequest('Расчёт уже находится на рассмотрении');
  }
  const comment = String(payload(ctx)?.comment || '').trim();
  if (commentRequired && !comment) return ctx.badRequest('Комментарий обязателен');
  const now = new Date().toISOString();
  const history = appendHistory({ ...project, status: nextStatus }, action, access.user, comment);
  const data: any = { status: nextStatus, reviewComment: comment || null, history, reviewedAt: now };
  if (nextStatus === 'RETURNED') {
    data.versionHistory = [...(Array.isArray(project.versionHistory) ? project.versionHistory : []), versionSnapshot(project)];
  }
  if (nextStatus === 'APPROVED') data.approvedAt = now;
  if (nextStatus === 'REJECTED') data.rejectedAt = now;
  const updated = await strapi.entityService.update(PROJECT_UID, Number(project.id), { data, populate: POPULATE as any });
  await Promise.all([
    audit(`PROJECT_CALCULATION_${action}`, updated, access.user, { status: project.status }, { status: nextStatus, comment }),
    notify(
      project.creator?.id,
      `Расчёт проекта: ${nextStatus === 'APPROVED' ? 'одобрено' : nextStatus === 'RETURNED' ? 'возвращено' : nextStatus === 'REJECTED' ? 'отклонено' : 'на рассмотрении'}`,
      `${project.requestNumber}${comment ? `: ${comment}` : ''}`,
      Number(project.id),
    ),
  ]);
  ctx.body = { data: cleanProject(updated) };
}

export default {
  async context(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const access = await getAccess(authUser.id);
    const participantProject = await strapi.db.query(PROJECT_UID).findOne({
      where: { teamMembers: { id: Number(access.user.id) } },
      select: ['id'],
    });
    const hasParticipantProjects = Boolean(participantProject);
    const departmentId = relationId(access.user?.department);
    const users = access.isSuperAdmin
      ? await strapi.db.query(USER_UID).findMany({
          where: { blocked: false },
          select: ['id', 'username', 'email', 'firstName', 'lastName', 'position'],
          populate: { department: { select: ['id', 'key', 'name_ru', 'name_kz'] } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : departmentId
      ? await strapi.db.query(USER_UID).findMany({
          where: { department: { id: departmentId }, blocked: false },
          select: ['id', 'username', 'email', 'firstName', 'lastName', 'position'],
          populate: { department: { select: ['id', 'key', 'name_ru', 'name_kz'] } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : [];
    const departments = access.isSuperAdmin
      ? await strapi.db.query(DEPARTMENT_UID).findMany({ orderBy: { name_ru: 'asc' } })
      : access.user?.department ? [access.user.department] : [];
    ctx.body = {
      data: {
        userId: Number(access.user.id),
        canAccess: access.canCreate || access.isReviewer || access.canViewDepartment || hasParticipantProjects,
        canCreate: access.canCreate,
        canReview: access.isReviewer || access.isSuperAdmin,
        canViewDepartment: access.canViewDepartment,
        isSuperAdmin: access.isSuperAdmin,
        department: access.user?.department || null,
        hourlyRate: money(access.departmentSetting?.hourlyRate),
        departmentCode: access.departmentSetting?.code || access.user?.department?.key || null,
        departmentRates: (Array.isArray(access.settings?.departmentSettings) ? access.settings.departmentSettings : [])
          .filter((item: any) => access.isSuperAdmin || Number(item.departmentId) === departmentId)
          .map((item: any) => ({ departmentId: Number(item.departmentId), hourlyRate: money(item.hourlyRate) })),
        departments,
        users,
      },
    };
  },

  async findMany(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const access = await getAccess(authUser.id);
    const participantProject = await strapi.db.query(PROJECT_UID).findOne({
      where: { teamMembers: { id: Number(access.user.id) } },
      select: ['id'],
    });
    if (!(access.canCreate || access.isReviewer || access.canViewDepartment || participantProject)) return ctx.forbidden('Нет доступа к расчёту проектов');

    const scope = String(ctx.query.scope || 'mine').toLowerCase();
    const conditions: any[] = [];
    if (scope === 'review' && (access.isSuperAdmin || access.isReviewer)) {
      conditions.push({ status: { $in: ['SUBMITTED', 'IN_REVIEW'] } });
    }
    if (!access.isSuperAdmin) {
      if (scope === 'review' && access.isReviewer) {
        // The configured reviewer must also see requests assigned before a
        // reviewer setting was changed. Status and controller checks remain
        // authoritative.
      } else if (scope === 'department' && access.canViewDepartment && access.user?.department?.id) {
        conditions.push({ department: { id: Number(access.user.department.id) } });
      } else if (scope === 'all' && access.isReviewer) {
        conditions.push({ $or: [{ reviewer: { id: Number(access.user.id) } }, { creator: { id: Number(access.user.id) } }] });
      } else {
        conditions.push({ $or: [{ creator: { id: Number(access.user.id) } }, { teamMembers: { id: Number(access.user.id) } }] });
      }
    }
    const status = String(ctx.query.status || '').toUpperCase();
    if (status) conditions.push({ status });
    const search = String(ctx.query.search || '').trim();
    if (search) conditions.push({ $or: [
      { requestNumber: { $containsi: search } },
      { title: { $containsi: search } },
      { customer: { $containsi: search } },
    ] });

    const page = Math.max(1, Number(ctx.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize || 20)));
    const where = conditions.length > 0 ? { $and: conditions } : {};
    const [items, total] = await Promise.all([
      strapi.db.query(PROJECT_UID).findMany({
        where,
        populate: POPULATE,
        orderBy: { updatedAt: 'desc' },
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      strapi.db.query(PROJECT_UID).count({ where }),
    ]);
    ctx.body = { data: items.map(cleanProject), meta: { pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } } };
  },

  async findOne(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const [access, project] = await Promise.all([getAccess(authUser.id), loadProject(ctx.params.id)]);
    if (!project) return ctx.notFound('Расчёт проекта не найден');
    if (!canViewProject(project, access)) return ctx.forbidden('Нет доступа к этому расчёту');
    ctx.body = { data: cleanProject(project) };
  },

  async create(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const access = await getAccess(authUser.id);
    if (!access.canCreate) return ctx.forbidden('Нет права создавать расчёты проектов');
    const raw = payload(ctx);
    const departmentId = access.isSuperAdmin && relationId(raw.departmentId)
      ? relationId(raw.departmentId)
      : relationId(access.user?.department);
    if (!departmentId) return ctx.badRequest('У пользователя не указано подразделение');
    const department = await strapi.db.query(DEPARTMENT_UID).findOne({ where: { id: departmentId } });
    if (!department) return ctx.badRequest('Подразделение не найдено');
    const deptSetting = getDepartmentSetting(access.settings, departmentId);
    if (!access.isSuperAdmin && access.user?.department?.canAccessProjectCalculations !== true && !deptSetting?.enabled && !getUserRule(access.settings, access.user.id)?.canCreate && !ALWAYS_ALLOWED_EMAILS.has(normalizedEmail(access.user.email))) {
      return ctx.forbidden('Подразделению не открыт модуль расчёта проектов');
    }
    const team = await sanitizeTeam(raw.team || [], departmentId, access);
    const baseInput = projectInput(raw);
    const fileError = await validateProjectFiles(baseInput);
    if (fileError) return ctx.badRequest(fileError);
    const calculated = calculatedFields({ ...baseInput, teamSnapshot: team.snapshot, hourlyRate: deptSetting?.hourlyRate }, access.settings);
    const reviewer = await findReviewer(access.settings);
    const history = appendHistory({ status: 'DRAFT' }, 'CREATED', access.user);
    let created: any = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const numbering = await nextNumber(department, access.settings);
      try {
        created = await strapi.entityService.create(PROJECT_UID, {
          data: {
            ...numbering,
            version: 1,
            status: 'DRAFT',
            title: baseInput.title || 'Новый расчёт проекта',
            description: baseInput.description,
            customer: baseInput.customer,
            startDate: baseInput.startDate,
            endDate: baseInput.endDate,
            creator: access.user.id,
            department: departmentId,
            teamMembers: team.ids,
            teamSnapshot: team.snapshot,
            ...calculated,
            aiReportFiles: baseInput.aiReportFiles,
            marketFiles: baseInput.marketFiles,
            reviewer: reviewer?.id || null,
            history,
            versionHistory: [],
            autosavedAt: new Date().toISOString(),
          } as any,
          populate: POPULATE as any,
        });
      } catch (error: any) {
        const duplicate = /unique|duplicate|requestNumber/i.test(String(error?.message || error));
        if (!duplicate || attempt === 2) throw error;
      }
    }
    await audit('PROJECT_CALCULATION_CREATED', created, access.user, null, { requestNumber: created.requestNumber });
    ctx.status = 201;
    ctx.body = { data: cleanProject(created) };
  },

  async update(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const [access, project] = await Promise.all([getAccess(authUser.id), loadProject(ctx.params.id)]);
    if (!project) return ctx.notFound('Расчёт проекта не найден');
    if (!canEditProject(project, access)) return ctx.forbidden('Расчёт недоступен для редактирования');
    const raw = payload(ctx);
    const baseInput = projectInput({ ...project, ...raw });
    const fileError = await validateProjectFiles(baseInput);
    if (fileError) return ctx.badRequest(fileError);
    const departmentId = relationId(project.department) as number;
    const team = await sanitizeTeam(raw.team ?? project.teamSnapshot ?? [], departmentId, access);
    const rate = getDepartmentSetting(access.settings, departmentId)?.hourlyRate ?? project.hourlyRate;
    const calculated = calculatedFields({ ...baseInput, teamSnapshot: team.snapshot, hourlyRate: rate }, access.settings);
    const data: any = {
      ...baseInput,
      title: baseInput.title || project.title,
      teamMembers: team.ids,
      teamSnapshot: team.snapshot,
      ...calculated,
      history: project.history || [],
      autosavedAt: new Date().toISOString(),
    };
    const updated = await strapi.entityService.update(PROJECT_UID, Number(project.id), { data, populate: POPULATE as any });
    ctx.body = { data: cleanProject(updated) };
  },

  async submit(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const [access, project] = await Promise.all([getAccess(authUser.id), loadProject(ctx.params.id)]);
    if (!project) return ctx.notFound('Расчёт проекта не найден');
    if (!canEditProject(project, access)) return ctx.forbidden('Расчёт нельзя отправить');
    const reviewer = await findReviewer(access.settings);
    if (!reviewer) return ctx.badRequest('В настройках указан пользователь согласования, которого нет в системе');
    const validationError = validateForSubmission(project);
    if (validationError) return ctx.badRequest(validationError);

    const returning = project.status === 'RETURNED';
    const nextVersion = returning ? Number(project.version || 1) + 1 : Number(project.version || 1);
    const code = departmentCode(getDepartmentSetting(access.settings, relationId(project.department))?.code || project.department?.key);
    const requestNumber = `${project.numberDate}-${code}-${String(project.sequenceNumber).padStart(4, '0')}-${String(nextVersion).padStart(2, '0')}`;
    const versionHistory = Array.isArray(project.versionHistory) ? [...project.versionHistory] : [];
    const calculated = calculatedFields(project, access.settings);
    const history = appendHistory({ ...project, status: 'SUBMITTED' }, returning ? 'RESUBMITTED' : 'SUBMITTED', access.user);
    const updated = await strapi.entityService.update(PROJECT_UID, Number(project.id), {
      data: {
        requestNumber,
        version: nextVersion,
        status: 'SUBMITTED',
        reviewer: reviewer.id,
        submittedAt: new Date().toISOString(),
        reviewComment: null,
        versionHistory,
        history,
        ...calculated,
      } as any,
      populate: POPULATE as any,
    });
    await Promise.all([
      audit('PROJECT_CALCULATION_SUBMITTED', updated, access.user, { status: project.status }, { status: 'SUBMITTED', version: nextVersion }),
      notify(reviewer.id, 'Новый расчёт проекта', `${updated.requestNumber}: ${updated.title}`, Number(updated.id)),
    ]);
    ctx.body = { data: cleanProject(updated) };
  },

  async startReview(ctx: Context) {
    return changeProjectStatus(ctx, 'IN_REVIEW', 'REVIEW_STARTED', false);
  },

  async returnForRevision(ctx: Context) {
    return changeProjectStatus(ctx, 'RETURNED', 'RETURNED_FOR_REVISION', true);
  },

  async approve(ctx: Context) {
    return changeProjectStatus(ctx, 'APPROVED', 'APPROVED', false);
  },

  async reject(ctx: Context) {
    return changeProjectStatus(ctx, 'REJECTED', 'REJECTED', true);
  },

  async reopen(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const [access, project] = await Promise.all([getAccess(authUser.id), loadProject(ctx.params.id)]);
    if (!project) return ctx.notFound('Расчёт проекта не найден');
    if (!access.isSuperAdmin) return ctx.forbidden('Только супер-администратор может переоткрыть расчёт');
    if (!['APPROVED', 'REJECTED'].includes(project.status)) return ctx.badRequest('Этот расчёт уже открыт');
    const comment = String(payload(ctx)?.comment || '').trim();
    const history = appendHistory({ ...project, status: 'RETURNED' }, 'REOPENED', access.user, comment);
    const versionHistory = [...(Array.isArray(project.versionHistory) ? project.versionHistory : []), versionSnapshot(project)];
    const updated = await strapi.entityService.update(PROJECT_UID, Number(project.id), {
      data: { status: 'RETURNED', reviewComment: comment || null, history, versionHistory },
      populate: POPULATE as any,
    });
    await audit('PROJECT_CALCULATION_REOPENED', updated, access.user, { status: project.status }, { status: 'RETURNED' });
    await notify(project.creator?.id, 'Расчёт проекта переоткрыт', project.requestNumber, Number(project.id));
    ctx.body = { data: cleanProject(updated) };
  },

  async getSettings(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const access = await getAccess(authUser.id);
    if (!access.isSuperAdmin) return ctx.forbidden('Только для супер-администратора');
    const [departments, users] = await Promise.all([
      strapi.db.query(DEPARTMENT_UID).findMany({ orderBy: { name_ru: 'asc' } }),
      strapi.db.query(USER_UID).findMany({
        where: { blocked: false },
        select: ['id', 'username', 'email', 'firstName', 'lastName', 'position'],
        populate: { department: { select: ['id', 'key', 'name_ru', 'name_kz'] } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    ctx.body = { data: { ...access.settings, departments, users } };
  },

  async updateSettings(ctx: Context) {
    const authUser = (ctx.state as any).user;
    if (!authUser) return ctx.unauthorized('Необходима авторизация');
    const access = await getAccess(authUser.id);
    if (!access.isSuperAdmin) return ctx.forbidden('Только для супер-администратора');
    const raw = payload(ctx);
    const reviewerEmail = normalizedEmail(raw.reviewerEmail || access.settings.reviewerEmail);
    const reviewer = await strapi.db.query(USER_UID).findOne({ where: { email: { $eqi: reviewerEmail } } });
    if (!reviewer) return ctx.badRequest('Пользователь согласования с таким email не найден');
    const margin = numberValue(raw.margin, DEFAULT_MARGIN);
    if (margin < 0 || margin > 1) return ctx.badRequest('Маржа должна быть числом от 0 до 1');
    const actualFormula = String(raw.actualFormula || DEFAULT_ACTUAL_FORMULA).trim();
    const aiFormula = String(raw.aiFormula || DEFAULT_AI_FORMULA).trim();
    try {
      validateProjectFormula(actualFormula);
      validateProjectFormula(aiFormula);
    } catch (error: any) {
      return ctx.badRequest(error?.message || 'Формула некорректна');
    }

    const departmentIds = new Set((await strapi.db.query(DEPARTMENT_UID).findMany({ select: ['id'] })).map((item: any) => Number(item.id)));
    const userIds = new Set((await strapi.db.query(USER_UID).findMany({ select: ['id'] })).map((item: any) => Number(item.id)));
    const departmentSettings = (Array.isArray(raw.departmentSettings) ? raw.departmentSettings : [])
      .map((item: any) => ({
        departmentId: Number(item?.departmentId),
        enabled: Boolean(item?.enabled),
        code: departmentCode(item?.code),
        hourlyRate: money(Math.max(0, numberValue(item?.hourlyRate))),
      }))
      .filter((item: any) => departmentIds.has(item.departmentId));
    const userAccessRules = (Array.isArray(raw.userAccessRules) ? raw.userAccessRules : [])
      .map((item: any) => ({
        userId: Number(item?.userId),
        canCreate: Boolean(item?.canCreate),
        canViewDepartment: Boolean(item?.canViewDepartment),
      }))
      .filter((item: any) => userIds.has(item.userId) && (item.canCreate || item.canViewDepartment));

    const oldData = {
      reviewerEmail: access.settings.reviewerEmail,
      margin: access.settings.margin,
      departmentSettings: access.settings.departmentSettings,
      userAccessRules: access.settings.userAccessRules,
    };
    const updated = await strapi.db.query(SETTINGS_UID).update({
      where: { id: access.settings.id },
      data: { reviewerEmail, margin, actualFormula, aiFormula, departmentSettings, userAccessRules },
    });
    await audit('PROJECT_CALCULATION_SETTINGS_UPDATED', { id: 'settings' }, access.user, oldData, {
      reviewerEmail: updated.reviewerEmail,
      margin: updated.margin,
      departmentSettings: updated.departmentSettings,
      userAccessRules: updated.userAccessRules,
      formulasChanged: actualFormula !== access.settings.actualFormula || aiFormula !== access.settings.aiFormula,
    });
    ctx.body = { data: updated };
  },
};
