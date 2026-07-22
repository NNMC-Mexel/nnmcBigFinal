import type { Context } from 'koa';
import {
  BPM_PROCESS_TEMPLATES,
  ONEC_REFERENCE_TYPES,
  buildOneCPayload,
  buildPhysicalPersonCheckPayload,
  getProcessTemplate,
  validateProcessData,
} from '../services/process-templates';

const REQUEST_UID = 'api::bpm-request.bpm-request' as any;
const CARD_UID = 'api::employee-card.employee-card' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const REVIEW_DEPARTMENTS = new Set(['HR', 'ACCOUNTING']);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);
const WORKFLOW_NEXT: Record<string, { status: string; stage: string; action: string; label: string }> = {
  DRAFT: { status: 'SUBMITTED', stage: 'Рассмотрение руководителем отдела', action: 'submitted_by_admin', label: 'Супер-админ отправил заявку на согласование' },
  SUBMITTED: { status: 'MANAGER_REVIEW', stage: 'Рассмотрение руководителем отдела', action: 'manager_review_started', label: 'Заявка передана руководителю отдела' },
  MANAGER_REVIEW: { status: 'HR_REVIEW', stage: 'Рассмотрение заявления сотрудником отдела кадров', action: 'manager_approved', label: 'Этап руководителя пройден' },
  HR_REVIEW: { status: 'ACCOUNTING_REVIEW', stage: 'Рассмотрение расчетного стола', action: 'hr_approved', label: 'Этап кадров пройден' },
  ACCOUNTING_REVIEW: { status: 'ONEC_PENDING', stage: 'Ожидает передачи в 1С', action: 'accounting_approved', label: 'Этап бухгалтерии пройден' },
  ONEC_SENT: { status: 'COMPLETED', stage: 'Завершено', action: 'completed', label: 'Заявка завершена' },
};

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

function formatRequest(item: any) {
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
    employeeIin: item.employeeIin,
    employeeName: item.employeeName,
    employeePosition: item.employeePosition,
    employeeDepartment: item.employeeDepartment,
    employeeOrganization: item.employeeOrganization,
    employeePersonnelNumber: item.employeePersonnelNumber,
    managerName: item.managerName,
    managerPosition: item.managerPosition,
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
    submittedAt: item.submittedAt,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
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
  const now = new Date().toISOString();
  const item = await strapi.entityService.create(REQUEST_UID, {
    data: {
      requestNumber,
      type: template.code,
      integrationType: template.integrationType,
      templateVersion: '1.0',
      title: requestTitle(template, processData, employeeName),
      status: 'SUBMITTED',
      workflowStage: 'Рассмотрение руководителем отдела',
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
      managerName: cleanString(body?.managerName || fallbackWorkplace.managerName || card?.managerName),
      managerPosition: cleanString(body?.managerPosition || fallbackWorkplace.managerPosition || card?.managerPosition),
      managerDepartment: cleanString(body?.managerDepartment || fallbackWorkplace.department),
      vacationType: template.code === 'VACATION' ? 'Отпуск ежегодный' : null,
      startDate: start ? toDateString(start) : null,
      endDate: end ? toDateString(end) : null,
      days,
      comment: cleanString(body?.comment),
      processData,
      history: [{ at: now, by: userDisplayName(user), action: 'submitted', label: 'Заявка создана и отправлена на согласование' }],
      onecPayload,
      onecStatus: 'pending',
      submittedAt: now,
      initiator: Number(user.id),
      ...(card?.id ? { employeeCard: Number(card.id) } : {}),
    },
  } as any);
  ctx.body = { data: formatRequest(item) };
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
    const mineOnly = ctx.query.mine === 'true' || ctx.query.mine === true || !reviewer;
    const status = cleanString(ctx.query.status);
    const type = cleanString(ctx.query.type);
    const andFilters: any[] = [];
    if (mineOnly) andFilters.push({ initiator: { id: Number(user.id) } });
    if (status && status !== 'ALL') andFilters.push({ status });
    if (type && type !== 'ALL') andFilters.push({ type });
    const filters = andFilters.length > 1 ? { $and: andFilters } : andFilters[0] || {};
    const items = await strapi.entityService.findMany(REQUEST_UID, { filters, sort: { createdAt: 'desc' }, limit: 500 } as any);
    ctx.body = { data: (items || []).map(formatRequest), meta: { canReview: reviewer, canAdvance: canAdvanceBpm(user) } };
  },

  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, { populate: ['initiator', 'employeeCard'] } as any);
    if (!item) ctx.throw(404, 'BPM request not found');
    if (!canReviewBpm(user) && Number(item?.initiator?.id) !== Number(user.id)) ctx.throw(404, 'BPM request not found');
    ctx.body = { data: formatRequest(item) };
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
    if (!canReviewBpm(user)) ctx.throw(403, 'Only HR, Accounting or SuperAdmin can send BPM requests to 1C');
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'BPM request not found');
    const template = getProcessTemplate(item.type);
    if (!template) ctx.throw(400, 'Для заявки не найден шаблон интеграции 1С');
    const history = Array.isArray(item.history) ? item.history : [];
    const integrationPayload = integrationPayloadForItem(item, template);

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
          history: [...history, {
            at: now,
            by: userDisplayName(user),
            action: result.existed ? 'found_in_1c' : 'sent_to_1c',
            label: result.existed ? 'Документ уже существует в 1С' : 'Документ создан в 1С',
          }],
        },
      } as any);
      ctx.body = { data: formatRequest(updated) };
    } catch (error: any) {
      const message = error?.message || String(error);
      await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: item.status === 'COMPLETED' ? 'COMPLETED' : 'ONEC_PENDING',
          workflowStage: item.status === 'COMPLETED' ? item.workflowStage : 'Ошибка отправки в 1С',
          onecStatus: 'error',
          onecError: message,
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
    if (!canAdvanceBpm(user)) ctx.throw(403, 'Only BPM SuperAdmin can advance BPM requests');
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'BPM request not found');
    const currentStatus = cleanString(item.status);
    if (TERMINAL_STATUSES.has(currentStatus)) ctx.throw(400, 'Заявка уже находится в конечном статусе');
    const transition = WORKFLOW_NEXT[currentStatus];
    if (!transition) ctx.throw(400, `Нет следующего этапа для статуса ${currentStatus || 'без статуса'}`);
    const now = new Date().toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
      data: {
        status: transition.status,
        workflowStage: transition.stage,
        completedAt: transition.status === 'COMPLETED' ? now : item.completedAt,
        history: [...history, { at: now, by: userDisplayName(user), action: transition.action, label: transition.label }],
      },
    } as any);
    ctx.body = { data: formatRequest(updated) };
  },
};
