import type { Context } from 'koa';

const REQUEST_UID = 'api::bpm-request.bpm-request' as any;
const CARD_UID = 'api::employee-card.employee-card' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const REVIEW_DEPARTMENTS = new Set(['HR', 'ACCOUNTING']);

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

function preferredWorkplace(card: any) {
  const workplaces = Array.isArray(card?.workplaces) ? card.workplaces : [];
  return workplaces.find((item: any) => item?.primary === true) || workplaces[0] || null;
}

function userDisplayName(user: any): string {
  return (
    `${user?.lastName || ''} ${user?.firstName || ''}`.trim() ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    ''
  );
}

async function loadCurrentUser(ctx: Context, strapi: any) {
  const user = ctx.state.user;
  if (!user?.id) ctx.throw(401, 'Not authenticated');

  return await strapi.entityService.findOne(USER_UID, user.id, {
    fields: ['id', 'username', 'email', 'firstName', 'lastName', 'isSuperAdmin'],
    populate: ['department', 'role'],
  });
}

function canReviewBpm(user: any): boolean {
  const key = cleanString(user?.department?.key).toUpperCase();
  return user?.isSuperAdmin === true || REVIEW_DEPARTMENTS.has(key);
}

async function loadEmployeeCardForUser(strapi: any, user: any) {
  const username = cleanString(user?.username);
  if (/^\d{12}$/.test(username)) {
    const byIin = await strapi.db.query(CARD_UID).findOne({ where: { iin: username } });
    if (byIin) return byIin;
  }

  return await strapi.db.query(CARD_UID).findOne({
    where: { user: { id: Number(user?.id) } },
  });
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
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

function buildVacationPayload(data: {
  requestNumber: string;
  card: any;
  workplace: any;
  startDate: string;
  endDate: string;
  days: number;
  vacationType: string;
  replacementEmployeeName: string;
  comment: string;
  managerName: string;
  managerPosition: string;
  managerDepartment: string;
}) {
  return {
    documentForm: 'Документ.ОтпускаСотрудников.Форма.ФормаДокумента',
    source: 'NNMC BPM',
    requestNumber: data.requestNumber,
    employee: {
      employeeId: data.workplace?.employeeId || null,
      iin: data.card?.iin || null,
      physicalPersonId: data.card?.physicalPersonId || null,
      fio: data.card?.fio || null,
      personnelNumber: data.workplace?.personnelNumber || null,
      position: data.workplace?.position || null,
      departmentId: data.workplace?.departmentId || null,
      department: data.workplace?.department || null,
      organizationId: data.workplace?.organizationId || null,
      organization: data.workplace?.organization || null,
    },
    manager: {
      name: data.managerName || null,
      position: data.managerPosition || null,
      department: data.managerDepartment || null,
    },
    vacation: {
      type: data.vacationType,
      startDate: data.startDate,
      endDate: data.endDate,
      calendarDays: data.days,
      replacementEmployeeName: data.replacementEmployeeName || null,
      comment: data.comment || null,
    },
  };
}

function formatRequest(item: any) {
  return {
    id: item.id,
    documentId: item.documentId,
    requestNumber: item.requestNumber,
    type: item.type,
    title: item.title,
    status: item.status,
    workflowStage: item.workflowStage,
    employeeName: item.employeeName,
    employeePosition: item.employeePosition,
    employeeDepartment: item.employeeDepartment,
    employeeOrganization: item.employeeOrganization,
    managerName: item.managerName,
    managerPosition: item.managerPosition,
    vacationType: item.vacationType,
    startDate: item.startDate,
    endDate: item.endDate,
    days: item.days,
    replacementEmployeeName: item.replacementEmployeeName,
    comment: item.comment,
    history: item.history || [],
    onecStatus: item.onecStatus,
    onecDocumentNumber: item.onecDocumentNumber,
    onecError: item.onecError,
    submittedAt: item.submittedAt,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export default {
  async topTypes(ctx: Context) {
    ctx.body = {
      data: [
        { type: 'VACATION', title: 'Отпуск', description: 'Ежегодный отпуск, отзыв, график отпусков', enabled: true },
        { type: 'SICK_LEAVE', title: 'Больничный лист', description: 'Регистрация больничного листа', enabled: false },
        { type: 'CERTIFICATE', title: 'Справка с места работы', description: 'Справка для банка, визы или госорганов', enabled: false },
        { type: 'MEMO', title: 'Служебная записка', description: 'Согласование внутреннего обращения', enabled: false },
        { type: 'BUSINESS_TRIP', title: 'Командировка', description: 'Заявка и приказ на командировку', enabled: false },
        { type: 'TRAINING', title: 'Обучение', description: 'План или приказ на обучение', enabled: false },
      ],
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
    const items = await strapi.entityService.findMany(REQUEST_UID, {
      filters,
      sort: { createdAt: 'desc' },
      limit: 200,
    } as any);

    ctx.body = { data: (items || []).map(formatRequest), meta: { canReview: reviewer } };
  },

  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id, {
      populate: ['initiator', 'employeeCard'],
    } as any);
    if (!item) ctx.throw(404, 'BPM request not found');

    if (!canReviewBpm(user) && Number(item?.initiator?.id) !== Number(user.id)) {
      ctx.throw(404, 'BPM request not found');
    }

    ctx.body = { data: formatRequest(item) };
  },

  async createVacation(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const card = await loadEmployeeCardForUser(strapi, user);
    if (!card) {
      ctx.throw(400, 'Employee card was not found. Run 1C employee synchronization first.');
      return;
    }

    const workplace = preferredWorkplace(card);
    if (!workplace) {
      ctx.throw(400, 'Primary workplace was not found in employee card.');
      return;
    }

    const body = ctx.request.body || {};
    const start = parseDate(body.startDate);
    const end = parseDate(body.endDate);
    if (!start || !end) ctx.throw(400, 'Vacation startDate and endDate are required');
    if (end < start) ctx.throw(400, 'Vacation endDate must be after startDate');

    const days = calendarDays(start, end);
    const requestNumber = await nextRequestNumber(strapi);
    const startDate = toDateString(start);
    const endDate = toDateString(end);
    const vacationType = cleanString(body.vacationType) || 'Отпуск ежегодный';
    const replacementEmployeeName = cleanString(body.replacementEmployeeName);
    const comment = cleanString(body.comment);
    const managerName = cleanString(body.managerName || workplace.managerName || card.managerName);
    const managerPosition = cleanString(body.managerPosition || workplace.managerPosition || card.managerPosition);
    const managerDepartment = cleanString(body.managerDepartment || workplace.managerDepartment || workplace.department);

    const onecPayload = buildVacationPayload({
      requestNumber,
      card,
      workplace,
      startDate,
      endDate,
      days,
      vacationType,
      replacementEmployeeName,
      comment,
      managerName,
      managerPosition,
      managerDepartment,
    });

    const now = new Date().toISOString();
    const item = await strapi.entityService.create(REQUEST_UID, {
      data: {
        requestNumber,
        type: 'VACATION',
        title: `Заявка на отпуск ${startDate} - ${endDate}`,
        status: 'SUBMITTED',
        workflowStage: 'Рассмотрение руководителем отдела',
        employeeIin: card.iin,
        employeeName: card.fio || userDisplayName(user),
        employeePosition: workplace.position || '',
        employeeDepartment: workplace.department || '',
        employeeDepartmentId: workplace.departmentId || '',
        employeeOrganization: workplace.organization || '',
        employeeOrganizationId: workplace.organizationId || '',
        employeePersonnelNumber: workplace.personnelNumber || '',
        managerName,
        managerPosition,
        managerDepartment,
        signingDirectorName: cleanString(body.signingDirectorName),
        signingDirectorPosition: cleanString(body.signingDirectorPosition),
        vacationType,
        startDate,
        endDate,
        days,
        replacementEmployeeName,
        comment,
        history: [
          {
            at: now,
            by: userDisplayName(user),
            action: 'submitted',
            label: 'Заявка создана сотрудником',
          },
        ],
        onecPayload,
        onecStatus: 'pending',
        submittedAt: now,
        initiator: Number(user.id),
        employeeCard: Number(card.id),
      },
    } as any);

    ctx.body = { data: formatRequest(item) };
  },

  async sendToOneC(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canReviewBpm(user)) ctx.throw(403, 'Only HR, Accounting or SuperAdmin can send BPM requests to 1C');

    const item = await strapi.entityService.findOne(REQUEST_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'BPM request not found');

    const baseOnecUrl = cleanString(process.env.ONEC_API_URL).replace(/\/+$/, '');
    const endpoint = cleanString(process.env.ONEC_VACATION_REQUEST_URL) ||
      (baseOnecUrl ? `${baseOnecUrl}/v1/vacation-requests` : '');
    if (!endpoint) {
      await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: 'ONEC_PENDING',
          workflowStage: 'Ожидает настройки отправки в 1С',
          onecStatus: 'pending',
          onecError: 'ONEC_VACATION_REQUEST_URL is not configured',
        },
      } as any);
      ctx.body = {
        data: {
          ...formatRequest(item),
          status: 'ONEC_PENDING',
          onecStatus: 'pending',
          onecError: 'ONEC_VACATION_REQUEST_URL is not configured',
        },
      };
      return;
    }

    try {
      const username = cleanString(process.env.ONEC_API_USER);
      const password = String(process.env.ONEC_API_PASSWORD || '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (username || password) {
        headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(item.onecPayload || {}),
      });
      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { raw: text };
      }

      if (!response.ok) {
        throw new Error(parsed?.message || parsed?.error || `1C returned HTTP ${response.status}`);
      }

      const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: 'ONEC_SENT',
          workflowStage: 'Передано в 1С',
          onecStatus: 'sent',
          onecDocumentNumber: cleanString(parsed?.number || parsed?.documentNumber),
          onecError: null,
        },
      } as any);
      ctx.body = { data: formatRequest(updated) };
    } catch (error: any) {
      const updated = await strapi.entityService.update(REQUEST_UID, item.id, {
        data: {
          status: 'ONEC_PENDING',
          workflowStage: 'Ошибка отправки в 1С',
          onecStatus: 'error',
          onecError: error?.message || String(error),
        },
      } as any);
      ctx.throw(502, updated.onecError || '1C integration failed');
    }
  },
};
