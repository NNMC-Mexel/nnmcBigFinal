import type { Context } from 'koa';
import {
  BPM_WORKFLOW_VERSION,
  BPM_PROCESS_TEMPLATES,
  ONEC_REFERENCE_TYPES,
  type BpmWorkflowStep,
  buildOneCPayload,
  buildPhysicalPersonCheckPayload,
  getProcessWorkflow,
  getProcessTemplate,
  validateProcessData,
} from '../services/process-templates';

const REQUEST_UID = 'api::bpm-request.bpm-request' as any;
const CARD_UID = 'api::employee-card.employee-card' as any;
const DEPARTMENT_UID = 'api::department.department' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const REVIEW_DEPARTMENTS = new Set(['HR', 'ACCOUNTING']);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);
const REVIEW_STATUSES = new Set(['MANAGER_REVIEW', 'HR_REVIEW', 'ACCOUNTING_REVIEW']);

function cleanString(value: any): string {
  return String(value ?? '').trim();
}

function parseDate(value: any): Date | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calendarDays(start: Date, end: Date): number {
  const ms = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor(ms / 86400000) + 1;
}

function preferredWorkplace(card: any, personnelNumber?: string) {
  const workplaces = Array.isArray(card?.workplaces) ? card.workplaces : [];
  const requested = cleanString(personnelNumber);
  if (requested) {
    const match = workplaces.find((item: any) => cleanString(item?.personnelNumber) === requested);
    if (match) return match;
  }
  return workplaces.find((item: any) => item?.primary === true) || workplaces[0] || null;
}

function userDisplayName(user: any): string {
  return `${user?.lastName || ''} ${user?.firstName || ''}`.trim() || user?.fullName || user?.username || user?.email || '';
}

async function loadCurrentUser(ctx: Context, strapi: any) {
  const user = ctx.state.user;
  if (!user?.id) ctx.throw(401, 'Not authenticated');
  return await strapi.entityService.findOne(USER_UID, user.id, {
    fields: ['id', 'username', 'email', 'firstName', 'lastName', 'position', 'isSuperAdmin'],
    populate: ['department', 'role'],
  });
}

function canReviewBpm(user: any): boolean {
  const key = cleanString(user?.department?.key).toUpperCase();
  return user?.isSuperAdmin === true || REVIEW_DEPARTMENTS.has(key);
}

function canAdvanceBpm(user: any): boolean {
  return user?.isSuperAdmin === true;
}

function departmentKey(user: any): string {
  return cleanString(user?.department?.key).toUpperCase();
}

function isOwner(item: any, user: any): boolean {
  return Number(item?.initiator?.id ?? item?.initiator) === Number(user?.id);
}

function isAssignedManager(item: any, user: any): boolean {
  return Number(item?.managerUser?.id ?? item?.managerUser) === Number(user?.id);
}

type WorkflowContext = {
  workflow: BpmWorkflowStep[];
  index: number;
  step: BpmWorkflowStep | null;
};

function workflowContext(item: any): WorkflowContext {
  const stored = Array.isArray(item?.workflowSnapshot)
    ? item.workflowSnapshot.filter((step: any) => step?.key && step?.status && step?.role && step?.title)
    : [];
  const workflow = (stored.length > 0 ? stored : getProcessWorkflow(cleanString(item?.type))) as BpmWorkflowStep[];
  const effectiveStatus = item?.status === 'RETURNED'
    ? cleanString(item?.returnedFromStatus)
    : cleanString(item?.status);
  let index = Number.isInteger(item?.currentStepIndex) ? Number(item.currentStepIndex) : -1;
  const statusOutsideRoute = ['ONEC_SENT', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(effectiveStatus);
  if (!workflow[index] || (!statusOutsideRoute && effectiveStatus && workflow[index]?.status !== effectiveStatus)) {
    index = workflow.findIndex((step) => step.status === effectiveStatus);
  }
  if (index < 0 && (effectiveStatus === 'DRAFT' || effectiveStatus === 'SUBMITTED')) index = 0;
  return { workflow, index, step: workflow[index] || null };
}

function canActOnStep(item: any, user: any, context = workflowContext(item)): boolean {
  if (user?.isSuperAdmin === true) return true;
  const role = context.step?.role;
  if (role === 'MANAGER') return isAssignedManager(item, user);
  if (role === 'HR') return departmentKey(user) === 'HR';
  if (role === 'ACCOUNTING') return departmentKey(user) === 'ACCOUNTING';
  if (role === 'ONEC') {
    const hasAccountingStep = context.workflow.some((step) => step.role === 'ACCOUNTING');
    return departmentKey(user) === (hasAccountingStep ? 'ACCOUNTING' : 'HR');
  }
  return false;
}

function canAccessRequest(item: any, user: any): boolean {
  return canReviewBpm(user) || isOwner(item, user) || isAssignedManager(item, user);
}

function availableActions(item: any, user: any) {
  const status = cleanString(item?.status);
  const context = workflowContext(item);
  const terminal = TERMINAL_STATUSES.has(status);
  const assignedActor = canActOnStep(item, user, context);
  const beforeOneC = status !== 'ONEC_SENT' && status !== 'COMPLETED';
  return {
    advance: status === 'ONEC_SENT'
      ? user?.isSuperAdmin === true
      : status === 'DRAFT' || status === 'SUBMITTED'
        ? user?.isSuperAdmin === true
        : !terminal && status !== 'RETURNED' && REVIEW_STATUSES.has(status) && assignedActor,
    returnForCorrection: REVIEW_STATUSES.has(status) && assignedActor,
    reject: REVIEW_STATUSES.has(status) && assignedActor,
    cancel: !terminal && beforeOneC && (isOwner(item, user) || user?.isSuperAdmin === true),
    resubmit: status === 'RETURNED' && (isOwner(item, user) || user?.isSuperAdmin === true),
    sendToOneC: status === 'ONEC_PENDING' && assignedActor,
    actorRole: context.step?.role || null,
  };
}

async function loadEmployeeCardForUser(strapi: any, user: any) {
  const username = cleanString(user?.username);
  if (/^\d{12}$/.test(username)) {
    const byIin = await strapi.db.query(CARD_UID).findOne({ where: { iin: username } });
    if (byIin) return byIin;
  }
  return await strapi.db.query(CARD_UID).findOne({ where: { user: { id: Number(user?.id) } } });
}

async function loadEmployeeContext(strapi: any, user: any, body: any, allowOwnCard: boolean) {
  const reviewer = canReviewBpm(user);
  let card: any = null;
  const requestedCardId = Number(body?.employeeCardId);
  if (reviewer && Number.isFinite(requestedCardId) && requestedCardId > 0) {
    card = await strapi.entityService.findOne(CARD_UID, requestedCardId);
  }
  if (!card && reviewer && /^\d{12}$/.test(cleanString(body?.employeeIin))) {
    card = await strapi.db.query(CARD_UID).findOne({ where: { iin: cleanString(body.employeeIin) } });
  }
  if (!card && allowOwnCard) card = await loadEmployeeCardForUser(strapi, user);
  return { card, workplace: preferredWorkplace(card, body?.personnelNumber) };
}

function normalizedDepartmentValue(value: any): string {
  return cleanString(value).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

async function resolveBpmManager(strapi: any, workplace: any) {
  const departmentName = normalizedDepartmentValue(workplace?.department);
  const departmentId = cleanString(workplace?.departmentId);
  if (!departmentName && !departmentId) return null;

  const departments = await strapi.db.query(DEPARTMENT_UID).findMany({
    populate: ['bpmManager'],
  });
  const expectedKey = departmentId ? `ONEC_${departmentId}`.toUpperCase() : '';
  const department = (departments || []).find((candidate: any) => {
    const names = [candidate?.name_ru, candidate?.name_kz].map(normalizedDepartmentValue);
    return (expectedKey && cleanString(candidate?.key).toUpperCase() === expectedKey) ||
      (departmentName && names.includes(departmentName));
  });
  return department?.bpmManager || null;
}

async function nextRequestNumber(strapi: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BPM-${year}-`;
  const existing = await strapi.entityService.findMany(REQUEST_UID, {
    filters: { requestNumber: { $startsWith: prefix } },
    fields: ['requestNumber'],
    sort: { requestNumber: 'desc' },
    limit: 1,
  } as any);
  const last = Array.isArray(existing) ? existing[0]?.requestNumber : null;
  const lastNumber = Number.parseInt(String(last || '').replace(prefix, ''), 10);
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`;
}

function formatRequest(item: any, user?: any) {
  const context = workflowContext(item);
  return {
    id: item.id,
    documentId: item.documentId,
    requestNumber: item.requestNumber,
    type: item.type,
    integrationType: item.integrationType,
    templateVersion: item.templateVersion,
    title: item.title,
    status: item.status,
    workflowStage: item.workflowStage,
    workflowVersion: item.workflowVersion || BPM_WORKFLOW_VERSION,
    workflowSnapshot: context.workflow,
    currentStepIndex: context.index,
    currentStepKey: item.currentStepKey || context.step?.key,
    currentActorRole: item.currentActorRole || context.step?.role,
    returnedFromStatus: item.returnedFromStatus,
    lastDecisionComment: item.lastDecisionComment,
    revision: item.revision || 1,
    employeeIin: item.employeeIin,
    employeeName: item.employeeName,
    employeePosition: item.employeePosition,
    employeeDepartment: item.employeeDepartment,
    employeeOrganization: item.employeeOrganization,
    employeePersonnelNumber: item.employeePersonnelNumber,
    managerName: item.managerName,
    managerPosition: item.managerPosition,
    managerUserId: item.managerUser?.id ?? item.managerUser ?? null,
    vacationType: item.vacationType,
    startDate: item.startDate,
    endDate: item.endDate,
    days: item.days,
    replacementEmployeeName: item.replacementEmployeeName,
    comment: item.comment,
    processData: item.processData || {},
    history: item.history || [],
    onecStatus: item.onecStatus,
    onecDocumentNumber: item.onecDocumentNumber,
    onecResponse: item.onecResponse,
    onecError: item.onecError,
    integrationAttemptCount: item.integrationAttemptCount || 0,
    lastIntegrationAttemptAt: item.lastIntegrationAttemptAt,
    submittedAt: item.submittedAt,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    availableActions: user ? availableActions(item, user) : undefined,
  };
}

function requestTitle(template: any, processData: any, employeeName: string): string {
  const start = cleanString(processData?.datestart || processData?.dateaccept || processData?.eventDate);
  const end = cleanString(processData?.dateend);
  const period = start ? ` ${start}${end ? ` - ${end}` : ''}` : '';
  return `${template.title}${period}${employeeName ? ` · ${employeeName}` : ''}`;
}

async function createProcessRequest(ctx: Context, strapi: any, user: any, body: any) {
  const template = getProcessTemplate(body?.type);
  if (!template) ctx.throw(400, 'Неизвестный тип BPM процесса');
  if (template.staffOnly && !canReviewBpm(user)) ctx.throw(403, 'Этот процесс доступен отделу кадров и супер-администратору');

  const processData = { ...(body?.data || {}) };
  const { card, workplace } = await loadEmployeeContext(strapi, user, body, template.employeeMode === 'self');
  const needsSingleEmployee = template.employeeMode === 'self' || template.employeeMode === 'single';
  const isSuperAdmin = user?.isSuperAdmin === true;
  const hasManualEmployee = canReviewBpm(user) && cleanString(body?.personnelNumber) !== '';
  if (needsSingleEmployee && !card && !isSuperAdmin && !hasManualEmployee) {
    ctx.throw(400, 'Карточка сотрудника не найдена. Синхронизируйте сотрудников с 1С.');
  }
  if (needsSingleEmployee && !workplace && !isSuperAdmin && !hasManualEmployee) {
    ctx.throw(400, 'В карточке сотрудника нет активного места работы из 1С.');
  }
  const personnelNumber = cleanString(workplace?.personnelNumber || body?.personnelNumber || processData?.PersonId);
  if (needsSingleEmployee && personnelNumber && !/^\d{9}$/.test(personnelNumber)) {
    ctx.throw(400, 'Табельный номер должен содержать 9 цифр');
  }

  const errors = validateProcessData(template, processData);
  if (errors.length > 0) ctx.throw(400, errors.join('. '));

  const fallbackCard = card || {
    iin: cleanString(body?.employeeIin) || (/^\d{12}$/.test(cleanString(user?.username)) ? cleanString(user.username) : ''),
    fio: cleanString(body?.employeeName) || (hasManualEmployee
      ? `Сотрудник ${cleanString(body.personnelNumber)}`
      : userDisplayName(user) || 'Супер-администратор'),
  };
  const fallbackWorkplace = workplace || {
    personnelNumber: cleanString(body?.personnelNumber),
    position: cleanString(body?.employeePosition || user?.position),
    department: cleanString(body?.employeeDepartment || user?.department?.name_ru || user?.department?.name_kz),
    departmentId: cleanString(user?.department?.documentId || user?.department?.id),
    organization: cleanString(body?.employeeOrganization) || 'АО «ННМЦ»',
    organizationId: '',
  };

  const requestNumber = await nextRequestNumber(strapi);
  const documentDate = toDateString(new Date());
  const start = parseDate(processData.datestart || processData.dateaccept || processData.eventDate);
  const end = parseDate(processData.dateend || processData.datestart || processData.dateaccept || processData.eventDate);
  const days = start && end && end >= start ? calendarDays(start, end) : null;
  const employeeName = cleanString(fallbackCard.fio || body?.employeeName || userDisplayName(user));
  const onecPayload = buildOneCPayload({
    template,
    requestNumber,
    documentDate,
    personnelNumber: fallbackWorkplace.personnelNumber,
    data: processData,
  });
  const workflow = getProcessWorkflow(template);
  const firstStep = workflow[0];
  const managerUser = await resolveBpmManager(strapi, fallbackWorkplace);
  const managerName = cleanString(
    body?.managerName || fallbackWorkplace.managerName || card?.managerName || userDisplayName(managerUser)
  );
  const now = new Date().toISOString();
  const item = await strapi.entityService.create(REQUEST_UID, {
    data: {
      requestNumber,
      type: template.code,
      integrationType: template.integrationType,
      templateVersion: '1.0',
      title: requestTitle(template, processData, employeeName),
      status: firstStep.status,
      workflowStage: firstStep.title,
      workflowVersion: BPM_WORKFLOW_VERSION,
      workflowSnapshot: workflow,
      currentStepIndex: 0,
      currentStepKey: firstStep.key,
      currentActorRole: firstStep.role,
      revision: 1,
      employeeIin: fallbackCard.iin || null,
      employeeName,
      employeePosition: fallbackWorkplace.position || '',
      employeeDepartment: fallbackWorkplace.department || '',
      employeeDepartmentId: fallbackWorkplace.departmentId || '',
      employeeOrganization: fallbackWorkplace.organization || '',
      employeeOrganizationId: fallbackWorkplace.organizationId || '',
      employeePersonnelNumber: needsSingleEmployee
        ? fallbackWorkplace.personnelNumber || cleanString(processData.PersonId)
        : '',
      managerName,
      managerPosition: cleanString(body?.managerPosition || fallbackWorkplace.managerPosition || card?.managerPosition),
      managerDepartment: cleanString(body?.managerDepartment || fallbackWorkplace.department),
      ...(managerUser?.id ? { managerUser: Number(managerUser.id) } : {}),
      vacationType: template.code === 'VACATION' ? 'Отпуск ежегодный' : null,
      startDate: start ? toDateString(start) : null,
      endDate: end ? toDateString(end) : null,
      days,
      comment: cleanString(body?.comment),
      processData,
      history: [{
        at: now,
        by: userDisplayName(user),
        action: 'submitted',
        label: `Заявка создана и передана на этап «${firstStep.title}»`,
        fromStatus: null,
        toStatus: firstStep.status,
        comment: cleanString(body?.comment),
      }],
      onecPayload,
      onecStatus: 'pending',
      submittedAt: now,
      initiator: Number(user.id),
      ...(card?.id ? { employeeCard: Number(card.id) } : {}),
    },
  } as any);
  ctx.body = {
    data: formatRequest({
      ...item,
      initiator: Number(user.id),
      managerUser: managerUser?.id ? Number(managerUser.id) : null,
    }, user),
  };
}

function oneCConfig(kind: 'documents' | 'references' | 'vacation-balance') {
  const baseUrl = cleanString(process.env.ONEC_API_URL).replace(/\/+$/, '');
  const envName = kind === 'documents'
    ? 'ONEC_BPM_REQUEST_URL'
    : kind === 'references'
      ? 'ONEC_REFERENCE_REQUEST_URL'
      : 'ONEC_VACATION_BALANCE_URL';
  const suffix = kind === 'references' ? '/RequestInfo' : '/Request';
  const endpoint = cleanString(process.env[envName]) || (baseUrl ? `${baseUrl}${suffix}` : '');
  const username = cleanString(process.env.ONEC_API_USER);
  const password = String(process.env.ONEC_API_PASSWORD || '');
  const timeoutMs = Math.max(5000, Math.min(Number.parseInt(process.env.ONEC_API_TIMEOUT_MS || '120000', 10) || 120000, 300000));
  if (!endpoint || !username || !password) throw new Error(`${envName}, ONEC_API_USER и ONEC_API_PASSWORD должны быть настроены`);
  return { endpoint, username, password, timeoutMs };
}

function responseCode(body: any): number | null {
  const raw = typeof body === 'number' || typeof body === 'string'
    ? body
    : body?.code ?? body?.Code ?? body?.statusCode ?? body?.resultCode;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const status = cleanString(body?.status || body?.result || body?.message).toLowerCase();
  if (status === 'success') return 1;
  if (status === 'fail') return 2;
  return null;
}

async function callOneC(options: {
  kind: 'documents' | 'references';
  command: 'Check' | 'Create';
  type: number;
  payload: Record<string, any>;
}) {
  const config = oneCConfig(options.kind);
  const url = new URL(config.endpoint);
  url.searchParams.set('Command', options.command);
  url.searchParams.set('Type', String(options.type));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64')}`,
      },
      body: JSON.stringify(options.payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(body?.message || body?.error || text || `1С вернула HTTP ${response.status}`);
    const code = responseCode(body);
    if (code === 2) throw new Error(body?.description || body?.message || '1С отклонила авторизацию или обработку запроса');
    if (code !== null && code !== 1 && code !== 3) throw new Error(body?.description || body?.message || `1С вернула код ${code}`);
    return { code: code ?? (options.command === 'Create' ? 1 : null), body };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error(`1С не ответила за ${config.timeoutMs} мс`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function collectPersonnelNumbers(item: any): string[] {
  const direct = cleanString(item?.employeePersonnelNumber || item?.onecPayload?.PersonId);
  const rows = Array.isArray(item?.onecPayload?.persons) ? item.onecPayload.persons : [];
  return Array.from(new Set([
    direct,
    ...rows.map((row: any) => cleanString(row?.PersonId || row?.personid)),
  ].filter(Boolean)));
}

function integrationPayloadForItem(item: any, template: any): Record<string, any> {
  if (item?.onecPayload?.docNumber || template.integrationType === 1 && Array.isArray(item?.onecPayload?.Persons)) {
    return item.onecPayload;
  }
  const processData = Object.keys(item?.processData || {}).length > 0
    ? item.processData
    : template.code === 'VACATION'
      ? {
          datestart: item.startDate,
          dateend: item.endDate,
          datestartwork: item.startDate,
          dateendwork: item.endDate,
          additional: false,
        }
      : {};
  return buildOneCPayload({
    template,
    requestNumber: item.requestNumber,
    documentDate: cleanString(item.createdAt).slice(0, 10) || toDateString(new Date()),
    personnelNumber: item.employeePersonnelNumber,
    data: processData,
  });
}

export default {
  async topTypes(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const reviewer = canReviewBpm(user);
    ctx.body = {
      data: BPM_PROCESS_TEMPLATES.map((template) => ({
        ...template,
        enabled: !template.staffOnly || reviewer,
      })),
      meta: { referenceTypes: ONEC_REFERENCE_TYPES },
    };
  },

  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const reviewer = canReviewBpm(user);
    const mineOnly = ctx.query.mine === 'true' || ctx.query.mine === true;
    const status = cleanString(ctx.query.status);
    const type = cleanString(ctx.query.type);
    const andFilters: any[] = [];
    if (mineOnly) {
      andFilters.push({ initiator: { id: Number(user.id) } });
    } else if (!reviewer) {
      andFilters.push({
        $or: [
          { initiator: { id: Number(user.id) } },
          { managerUser: { id: Number(user.id) } },
        ],
      });
    }
    if (status && status !== 'ALL') andFilters.push({ status });
    if (type && type !== 'ALL') andFilters.push({ type });
    const filters = andFilters.length > 1 ? { $and: andFilters } : andFilters[0] || {};
    const items = await strapi.entityService.findMany(REQUEST_UID, {
      filters,
      populate: ['initiator', 'managerUser'],
      sort: { createdAt: 'desc' },
      limit: 500,
    } as any);
    ctx.body = {
      data: (items || []).map((item: any) => formatRequest(item, user)),
      meta: { canReview: reviewer, canAdvance: canAdvanceBpm(user) },
    };
  },

  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'employeeCard', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!canAccessRequest(item, user)) ctx.throw(404, 'BPM request not found');
    ctx.body = { data: formatRequest(item, user) };
  },

  async createProcess(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    await createProcessRequest(ctx, strapi, user, ctx.request.body || {});
  },

  async createVacation(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const body = ctx.request.body || {};
    await createProcessRequest(ctx, strapi, user, {
      type: 'VACATION',
      employeeCardId: body.employeeCardId,
      personnelNumber: body.personnelNumber,
      managerName: body.managerName,
      managerPosition: body.managerPosition,
      comment: body.comment,
      data: {
        datestart: body.startDate,
        dateend: body.endDate,
        datestartwork: body.workPeriodStart || body.startDate,
        dateendwork: body.workPeriodEnd || body.endDate,
        additional: false,
      },
    });
  },

  async sendToOneC(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!availableActions(item, user).sendToOneC) {
      ctx.throw(403, 'Передать заявку в 1С может только ответственный участник текущего этапа');
    }
    const template = getProcessTemplate(item.type);
    if (!template) ctx.throw(400, 'Для заявки не найден шаблон интеграции 1С');
    const history = Array.isArray(item.history) ? item.history : [];
    const integrationPayload = integrationPayloadForItem(item, template);
    const attemptAt = new Date().toISOString();
    const attemptCount = Number(item.integrationAttemptCount || 0) + 1;

    try {
      if (template.integrationType !== 1) {
        const personIds = collectPersonnelNumbers({ ...item, onecPayload: integrationPayload });
        if (personIds.length === 0) throw new Error('Не указан табельный номер сотрудника для проверки физического лица в 1С');
        for (const personnelNumber of personIds) {
          const personPayload = buildPhysicalPersonCheckPayload({
            personnelNumber,
            iin: personIds.length === 1 ? item.employeeIin : '',
          });
          if (!personPayload) continue;
          const personCheck = await callOneC({ kind: 'documents', command: 'Check', type: 1, payload: personPayload });
          if (personCheck.code === 3) {
            throw new Error(`Физическое лицо с табельным номером ${personnelNumber} отсутствует в 1С. Сначала отправьте процесс «Физическое лицо».`);
          }
        }
      }

      const check = await callOneC({ kind: 'documents', command: 'Check', type: template.integrationType, payload: integrationPayload });
      const result = check.code === 1
        ? { code: 1, body: check.body, existed: true }
        : { ...(await callOneC({ kind: 'documents', command: 'Create', type: template.integrationType, payload: integrationPayload })), existed: false };
      if (result.code !== 1) throw new Error('1С не подтвердила создание документа');

      const now = new Date().toISOString();
      const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: item.status === 'COMPLETED' ? 'COMPLETED' : 'ONEC_SENT',
          workflowStage: item.status === 'COMPLETED' ? 'Завершено' : 'Передано в 1С',
          onecStatus: 'sent',
          onecPayload: integrationPayload,
          onecDocumentNumber: cleanString(result.body?.number || result.body?.documentNumber || item.requestNumber),
          onecResponse: result.body,
          onecError: null,
          integrationAttemptCount: attemptCount,
          lastIntegrationAttemptAt: attemptAt,
          history: [...history, {
            at: now,
            by: userDisplayName(user),
            action: result.existed ? 'found_in_1c' : 'sent_to_1c',
            label: result.existed ? 'Документ уже существует в 1С' : 'Документ создан в 1С',
            fromStatus: 'ONEC_PENDING',
            toStatus: 'ONEC_SENT',
          }],
        },
      } as any);
      ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
    } catch (error: any) {
      const message = error?.message || String(error);
      await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: item.status === 'COMPLETED' ? 'COMPLETED' : 'ONEC_PENDING',
          workflowStage: item.status === 'COMPLETED' ? item.workflowStage : 'Ошибка отправки в 1С',
          onecStatus: 'error',
          onecError: message,
          integrationAttemptCount: attemptCount,
          lastIntegrationAttemptAt: attemptAt,
          history: [...history, {
            at: attemptAt,
            by: userDisplayName(user),
            action: 'onec_failed',
            label: 'Ошибка передачи в 1С',
            fromStatus: item.status,
            toStatus: item.status === 'COMPLETED' ? 'COMPLETED' : 'ONEC_PENDING',
            comment: message,
          }],
        },
      } as any);
      ctx.throw(502, message);
    }
  },

  async syncReference(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canAdvanceBpm(user)) ctx.throw(403, 'Only BPM SuperAdmin can synchronize 1C reference data');
    const body = ctx.request.body || {};
    const type = Number(body.type);
    if (!ONEC_REFERENCE_TYPES.some((item) => item.type === type)) ctx.throw(400, 'Неизвестный тип справочника 1С');
    const item = body.item || {};
    if (!cleanString(item.id) || !cleanString(item.name)) ctx.throw(400, 'Для справочника обязательны id и name');
    const result = await callOneC({ kind: 'references', command: body.command === 'Create' ? 'Create' : 'Check', type, payload: { id: cleanString(item.id), name: cleanString(item.name) } });
    ctx.body = { success: result.code === 1 || result.code === 3, code: result.code, data: result.body };
  },

  async vacationBalance(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const card = await loadEmployeeCardForUser(strapi, user);
    const ownNumbers = (Array.isArray(card?.workplaces) ? card.workplaces : []).map((item: any) => cleanString(item?.personnelNumber));
    const personnelNumber = cleanString(ctx.query.personnelNumber || ownNumbers[0]);
    if (!personnelNumber) ctx.throw(400, 'Не указан табельный номер');
    if (!canReviewBpm(user) && !ownNumbers.includes(personnelNumber)) ctx.throw(403, 'Нельзя запрашивать остатки отпуска другого сотрудника');
    const date = cleanString(ctx.query.date) || toDateString(new Date());
    const config = oneCConfig('vacation-balance');
    const url = new URL(config.endpoint);
    url.searchParams.set('IdPerson', personnelNumber);
    url.searchParams.set('Date', date.replace(/-/g, ''));
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64')}` },
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) ctx.throw(502, data?.message || text || `1С вернула HTTP ${response.status}`);
    ctx.body = { data: Array.isArray(data?.vacation) ? data.vacation : [], raw: data };
  },

  async advance(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    const currentStatus = cleanString(item.status);
    if (TERMINAL_STATUSES.has(currentStatus)) ctx.throw(400, 'Заявка уже находится в конечном статусе');
    if (!availableActions(item, user).advance) ctx.throw(403, 'Вы не являетесь ответственным за текущий этап заявки');
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    if (currentStatus === 'ONEC_SENT') {
      const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: 'COMPLETED',
          workflowStage: 'Завершено',
          currentStepKey: null,
          currentActorRole: null,
          completedAt: now,
          history: [...history, {
            at: now,
            by: userDisplayName(user),
            action: 'completed',
            label: 'Заявка завершена после передачи в 1С',
            fromStatus: currentStatus,
            toStatus: 'COMPLETED',
          }],
        },
      } as any);
      ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
      return;
    }

    const context = workflowContext(item);
    const isLegacyEntry = currentStatus === 'DRAFT' || currentStatus === 'SUBMITTED';
    const nextIndex = isLegacyEntry ? context.index : context.index + 1;
    const nextStep = context.workflow[nextIndex];
    if (!nextStep) ctx.throw(400, 'В маршруте не найден следующий этап');
    const approvedStep = isLegacyEntry ? null : context.step;
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        status: nextStep.status,
        workflowStage: nextStep.title,
        workflowVersion: item.workflowVersion || BPM_WORKFLOW_VERSION,
        workflowSnapshot: context.workflow,
        currentStepIndex: nextIndex,
        currentStepKey: nextStep.key,
        currentActorRole: nextStep.role,
        lastDecisionComment: cleanString((ctx.request.body as any)?.comment) || null,
        history: [...history, {
          at: now,
          by: userDisplayName(user),
          action: approvedStep ? 'approved' : 'legacy_routed',
          label: approvedStep
            ? `Этап «${approvedStep.title}» согласован. Передано: ${nextStep.title}`
            : `Заявка переведена на этап «${nextStep.title}»`,
          fromStatus: currentStatus,
          toStatus: nextStep.status,
          comment: cleanString((ctx.request.body as any)?.comment),
        }],
      },
    } as any);
    ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
  },

  async returnForCorrection(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!availableActions(item, user).returnForCorrection) ctx.throw(403, 'Вернуть заявку может только ответственный текущего этапа');
    const reason = cleanString((ctx.request.body as any)?.reason);
    if (reason.length < 3) ctx.throw(400, 'Укажите причину возврата');
    const context = workflowContext(item);
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        status: 'RETURNED',
        workflowStage: `Возвращено на исправление: ${context.step?.title || 'текущий этап'}`,
        returnedFromStatus: item.status,
        lastDecisionComment: reason,
        history: [...history, {
          at: now,
          by: userDisplayName(user),
          action: 'returned',
          label: 'Заявка возвращена на исправление',
          fromStatus: item.status,
          toStatus: 'RETURNED',
          comment: reason,
        }],
      },
    } as any);
    ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
  },

  async reject(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!availableActions(item, user).reject) ctx.throw(403, 'Отклонить заявку может только ответственный текущего этапа');
    const reason = cleanString((ctx.request.body as any)?.reason);
    if (reason.length < 3) ctx.throw(400, 'Укажите причину отклонения');
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        status: 'REJECTED',
        workflowStage: 'Отклонено',
        lastDecisionComment: reason,
        completedAt: now,
        history: [...history, {
          at: now,
          by: userDisplayName(user),
          action: 'rejected',
          label: 'Заявка отклонена',
          fromStatus: item.status,
          toStatus: 'REJECTED',
          comment: reason,
        }],
      },
    } as any);
    ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
  },

  async cancel(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!availableActions(item, user).cancel) ctx.throw(403, 'Отозвать эту заявку нельзя');
    const reason = cleanString((ctx.request.body as any)?.reason);
    if (reason.length < 3) ctx.throw(400, 'Укажите причину отзыва');
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        status: 'CANCELLED',
        workflowStage: 'Отозвано инициатором',
        lastDecisionComment: reason,
        completedAt: now,
        history: [...history, {
          at: now,
          by: userDisplayName(user),
          action: 'cancelled',
          label: 'Заявка отозвана',
          fromStatus: item.status,
          toStatus: 'CANCELLED',
          comment: reason,
        }],
      },
    } as any);
    ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
  },

  async resubmit(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'managerUser'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!availableActions(item, user).resubmit) ctx.throw(403, 'Повторная отправка этой заявки недоступна');
    const template = getProcessTemplate(item.type);
    if (!template) ctx.throw(400, 'Для заявки не найден шаблон');
    const body = (ctx.request.body || {}) as any;
    const processData = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? { ...body.data }
      : { ...(item.processData || {}) };
    const errors = validateProcessData(template, processData);
    if (errors.length > 0) ctx.throw(400, errors.join('. '));
    const context = workflowContext(item);
    if (!context.step) ctx.throw(400, 'Не удалось восстановить этап заявки');
    const documentDate = cleanString(item.createdAt).slice(0, 10) || toDateString(new Date());
    const onecPayload = buildOneCPayload({
      template,
      requestNumber: item.requestNumber,
      documentDate,
      personnelNumber: item.employeePersonnelNumber,
      data: processData,
    });
    const start = parseDate(processData.datestart || processData.dateaccept || processData.eventDate);
    const end = parseDate(processData.dateend || processData.datestart || processData.dateaccept || processData.eventDate);
    const days = start && end && end >= start ? calendarDays(start, end) : null;
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    const revision = Number(item.revision || 1) + 1;
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        title: requestTitle(template, processData, item.employeeName),
        status: context.step.status,
        workflowStage: context.step.title,
        currentStepIndex: context.index,
        currentStepKey: context.step.key,
        currentActorRole: context.step.role,
        returnedFromStatus: null,
        lastDecisionComment: cleanString(body.comment) || null,
        revision,
        processData,
        onecPayload,
        onecStatus: 'pending',
        onecError: null,
        startDate: start ? toDateString(start) : null,
        endDate: end ? toDateString(end) : null,
        days,
        submittedAt: now,
        completedAt: null,
        history: [...history, {
          at: now,
          by: userDisplayName(user),
          action: 'resubmitted',
          label: `Исправленная заявка повторно отправлена (ревизия ${revision})`,
          fromStatus: 'RETURNED',
          toStatus: context.step.status,
          comment: cleanString(body.comment),
        }],
      },
    } as any);
    ctx.body = { data: formatRequest({ ...updated, initiator: item.initiator, managerUser: item.managerUser }, user) };
  },
};
