import type { Context } from 'koa';
import {
  ART_TRANSITIONS,
  DEFAULT_ART_DAY_CODES,
  DEFAULT_ART_POLICY,
  artDate,
  artDateString,
  canCreateArtDepartment,
  classifySchedule,
  cleanArtString,
  codeDefaultHours,
  decimal,
  eachDateInMonth,
  eventDayCode,
  isDateInRange,
  isUnresolvedCode,
  normalizedPeriodKey,
  plannedDayForDate,
  sourceHash,
  type ArtDayCode,
} from '../services/art-engine';

const PERIOD_UID = 'api::art-period.art-period' as any;
const DAY_UID = 'api::art-day.art-day' as any;
const EVENT_UID = 'api::art-event.art-event' as any;
const POLICY_UID = 'api::art-policy.art-policy' as any;
const CARD_UID = 'api::employee-card.employee-card' as any;
const REQUEST_UID = 'api::bpm-request.bpm-request' as any;
const DEPARTMENT_UID = 'api::department.department' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const HR_KEY = 'HR';
const REVIEW_KEYS = new Set(['HR', 'ACCOUNTING']);
const EVENT_TYPES = new Set([
  'VACATION',
  'SICK_LEAVE',
  'DAY_OFF',
  'WEEKEND_WORK',
  'OVERTIME',
  'CHILDCARE_LEAVE',
  'CHILDCARE_RETURN',
  'UNPAID_LEAVE',
  'BUSINESS_TRIP',
  'VACATION_RECALL',
  'SCHEDULE_CHANGE',
]);
const APPROVED_EVENT_STATUSES = new Set(['ONEC_PENDING', 'ONEC_SENT', 'COMPLETED']);

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(cleanArtString(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function userName(user: any): string {
  return `${cleanArtString(user?.lastName)} ${cleanArtString(user?.firstName)}`.trim()
    || cleanArtString(user?.username || user?.email)
    || 'Система';
}

function departmentKey(user: any): string {
  return cleanArtString(user?.department?.key).toUpperCase();
}

function relationId(value: any): number | null {
  const id = Number(value?.id ?? value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function loadCurrentUser(ctx: Context, strapi: any) {
  if (!ctx.state.user?.id) ctx.throw(401, 'Not authenticated');
  return await strapi.entityService.findOne(USER_UID, ctx.state.user.id, {
    fields: ['id', 'username', 'email', 'firstName', 'lastName', 'isSuperAdmin'],
    populate: ['department', 'role'],
  });
}

async function loadPeriod(strapi: any, id: unknown) {
  const numericId = numeric(id);
  if (!numericId) return null;
  return await strapi.entityService.findOne(PERIOD_UID, numericId, {
    populate: ['ownerUser', 'responsibleUser', 'managerUser'],
  } as any);
}

function isAssigned(period: any, user: any): boolean {
  const id = Number(user?.id);
  return [period?.ownerUser, period?.responsibleUser, period?.managerUser]
    .some((value) => relationId(value) === id);
}

function canReviewAll(user: any): boolean {
  return user?.isSuperAdmin === true || REVIEW_KEYS.has(departmentKey(user));
}

function canAccessPeriod(period: any, user: any): boolean {
  return canReviewAll(user) || isAssigned(period, user);
}

function canEditPeriod(period: any, user: any): boolean {
  if (user?.isSuperAdmin === true || departmentKey(user) === HR_KEY) return true;
  return [period?.ownerUser, period?.responsibleUser].some((value) => relationId(value) === Number(user?.id));
}

function canActAs(period: any, user: any, role: string): boolean {
  if (user?.isSuperAdmin === true) return true;
  if (role === 'SUPERADMIN') return false;
  if (role === 'HR') return departmentKey(user) === HR_KEY;
  if (role === 'MANAGER') return relationId(period?.managerUser) === Number(user?.id);
  if (role === 'RESPONSIBLE') return canEditPeriod(period, user);
  return false;
}

function availableActions(period: any, user: any) {
  const result: Record<string, boolean> = {};
  for (const [action, transition] of Object.entries(ART_TRANSITIONS)) {
    result[action] = transition.from.includes(period.status) && canActAs(period, user, transition.role);
  }
  if (period.phase !== 'PLAN') result.submit_plan = false;
  if (period.phase !== 'ACTUAL') result.submit_actual = false;
  result.return = ['MANAGER_REVIEW', 'HR_REVIEW', 'FINAL_HR_REVIEW'].includes(period.status)
    && (user?.isSuperAdmin === true
      || (period.status === 'MANAGER_REVIEW' && relationId(period.managerUser) === Number(user?.id))
      || (period.status !== 'MANAGER_REVIEW' && departmentKey(user) === HR_KEY));
  result.sendToOneC = period.status === 'ONEC_PENDING'
    && (user?.isSuperAdmin === true || departmentKey(user) === HR_KEY);
  result.sendToKpi = period.status === 'ONEC_SENT'
    && (user?.isSuperAdmin === true || departmentKey(user) === HR_KEY);
  result.editPlan = period.phase === 'PLAN'
    && ['DRAFT', 'RETURNED'].includes(period.status)
    && canEditPeriod(period, user);
  result.editActual = period.phase === 'ACTUAL'
    && ['ACTIVE', 'RETURNED'].includes(period.status)
    && canEditPeriod(period, user);
  return result;
}

function formatPeriod(period: any, user?: any) {
  return {
    id: period.id,
    documentId: period.documentId,
    periodKey: period.periodKey,
    year: period.year,
    month: period.month,
    organizationId: period.organizationId,
    organizationName: period.organizationName,
    departmentId: period.departmentId,
    departmentName: period.departmentName,
    status: period.status,
    phase: period.phase,
    revision: period.revision,
    employeeCount: period.employeeCount,
    plannedHours: decimal(period.plannedHours),
    actualHours: decimal(period.actualHours),
    unresolvedDays: period.unresolvedDays,
    locked: period.locked,
    lastDecisionComment: period.lastDecisionComment,
    history: Array.isArray(period.history) ? period.history : [],
    onecStatus: period.onecStatus,
    onecDocumentNumber: period.onecDocumentNumber,
    onecError: period.onecError,
    kpiStatus: period.kpiStatus,
    kpiArchiveId: period.kpiArchiveId,
    kpiError: period.kpiError,
    planSubmittedAt: period.planSubmittedAt,
    planApprovedAt: period.planApprovedAt,
    actualSubmittedAt: period.actualSubmittedAt,
    approvedAt: period.approvedAt,
    closedAt: period.closedAt,
    ownerUser: relationUser(period.ownerUser),
    responsibleUser: relationUser(period.responsibleUser),
    managerUser: relationUser(period.managerUser),
    availableActions: user ? availableActions(period, user) : undefined,
  };
}

function relationUser(value: any) {
  if (!value || typeof value !== 'object') return value ? { id: Number(value) } : null;
  return { id: value.id, username: value.username, name: userName(value) };
}

function formatDay(day: any) {
  return {
    id: day.id,
    dayKey: day.dayKey,
    employeeCardId: relationId(day.employeeCard),
    employeeIin: day.employeeIin,
    physicalPersonId: day.physicalPersonId,
    personnelNumber: day.personnelNumber,
    employeeName: day.employeeName,
    positionName: day.positionName,
    scheduleName: day.scheduleName,
    scheduleKind: day.scheduleKind,
    date: day.date,
    plannedCode: day.plannedCode,
    plannedStart: day.plannedStart,
    plannedEnd: day.plannedEnd,
    plannedHours: decimal(day.plannedHours),
    actualCode: day.actualCode,
    actualHours: decimal(day.actualHours),
    nightHours: decimal(day.nightHours),
    overtimeHours: decimal(day.overtimeHours),
    holidayHours: decimal(day.holidayHours),
    sourceType: day.sourceType,
    sourceRequestNumber: day.sourceRequestNumber,
    eventType: day.eventType,
    manualOverride: day.manualOverride,
    plannedManualOverride: day.plannedManualOverride,
    actualManualOverride: day.actualManualOverride,
    overrideReason: day.overrideReason,
    version: day.version,
    editedByName: day.editedByName,
  };
}

function normalized(value: unknown): string {
  return cleanArtString(value).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function accessDepartmentMatches(department: any, departmentId: string, departmentName: string): boolean {
  const expectedKey = departmentId ? `ONEC_${departmentId}`.toUpperCase() : '';
  return Boolean(
    (expectedKey && cleanArtString(department?.key).toUpperCase() === expectedKey)
    || [department?.name_ru, department?.name_kz]
      .some((name) => normalized(name) === normalized(departmentName))
  );
}

function canCreateDepartment(user: any, department: any): boolean {
  return canCreateArtDepartment({
    isSuperAdmin: user?.isSuperAdmin === true,
    userDepartmentKey: departmentKey(user),
    userId: user?.id,
    responsibleUserId: relationId(department?.artResponsible),
  });
}

async function accessDepartments(strapi: any) {
  return await strapi.db.query(DEPARTMENT_UID).findMany({
    populate: ['bpmManager', 'artResponsible'],
  });
}

function workplaceMatches(workplace: any, departmentId: string, departmentName: string): boolean {
  const byId = departmentId && cleanArtString(workplace?.departmentId) === departmentId;
  const byName = departmentName && normalized(workplace?.department) === normalized(departmentName);
  return Boolean(byId || byName);
}

function workplaceActiveInMonth(workplace: any, year: number, month: number): boolean {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const dates = eachDateInMonth(year, month);
  const end = dates[dates.length - 1];
  const hireDate = cleanArtString(workplace?.hireDate).slice(0, 10);
  const dismissalDate = cleanArtString(workplace?.dismissalDate).slice(0, 10);
  return (!hireDate || hireDate <= end) && (!dismissalDate || dismissalDate >= start);
}

async function activePolicy(strapi: any) {
  const stored = await strapi.db.query(POLICY_UID).findOne({
    where: { active: true },
    orderBy: [{ version: 'desc' }],
  });
  return stored || DEFAULT_ART_POLICY;
}

function policyCodes(policy: any): ArtDayCode[] {
  return Array.isArray(policy?.dayCodes) && policy.dayCodes.length > 0
    ? policy.dayCodes
    : DEFAULT_ART_DAY_CODES;
}

async function periodDays(strapi: any, periodId: number) {
  return await strapi.db.query(DAY_UID).findMany({
    where: { period: { id: periodId } },
    populate: ['employeeCard'],
    orderBy: [{ employeeName: 'asc' }, { personnelNumber: 'asc' }, { date: 'asc' }],
  });
}

function periodSummary(days: any[]) {
  const personnelNumbers = new Set(days.map((day) => cleanArtString(day.personnelNumber)).filter(Boolean));
  return {
    employeeCount: personnelNumbers.size,
    plannedHours: days.reduce((sum, day) => sum + decimal(day.plannedHours), 0),
    actualHours: days.reduce((sum, day) => sum + decimal(day.actualHours), 0),
    unresolvedDays: days.reduce((sum, day) => sum + (isUnresolvedCode(day.actualCode || day.plannedCode) ? 1 : 0), 0),
  };
}

function planValidationErrors(days: any[], policy: any): string[] {
  const codes = policyCodes(policy);
  const workCodes = new Set(
    codes.filter((code) => code.kind === 'work').map((code) => cleanArtString(code.code).toUpperCase())
  );
  const byEmployee = new Map<string, any[]>();
  for (const day of days) {
    const key = cleanArtString(day.personnelNumber);
    if (!key) continue;
    byEmployee.set(key, [...(byEmployee.get(key) || []), day]);
  }

  const errors: string[] = [];
  const requiredSaturdays = Math.max(
    0,
    numeric(policy?.scheduleRules?.FIVE_DAY?.workingSaturdaysPerMonth, 1)
  );
  for (const employeeDays of byEmployee.values()) {
    const employee = employeeDays[0];
    const workDays = employeeDays.filter((day) =>
      workCodes.has(cleanArtString(day.plannedCode).toUpperCase()) && decimal(day.plannedHours) > 0
    );
    if (workDays.length === 0) {
      errors.push(`${employee.employeeName}: не назначены рабочие дни или смены`);
      continue;
    }
    if (employee.scheduleKind !== 'FIVE_DAY' || requiredSaturdays === 0) continue;
    const workingSaturdays = workDays.filter((day) => artDate(day.date).getUTCDay() === 6).length;
    if (workingSaturdays !== requiredSaturdays) {
      errors.push(
        `${employee.employeeName}: рабочих суббот ${workingSaturdays}, требуется ${requiredSaturdays}`
      );
    }
  }
  return errors;
}

async function refreshPeriodSummary(strapi: any, period: any) {
  const days = await periodDays(strapi, Number(period.id));
  const summary = periodSummary(days);
  return await strapi.entityService.update(PERIOD_UID, period.id, { data: summary as any });
}

function appendHistory(period: any, user: any, action: string, label: string, fromStatus: string, toStatus: string, comment = '') {
  return [
    ...(Array.isArray(period.history) ? period.history : []),
    {
      at: new Date().toISOString(),
      by: userName(user),
      action,
      label,
      fromStatus,
      toStatus,
      comment,
      revision: period.revision,
    },
  ];
}

function periodRange(period: any) {
  const dates = eachDateInMonth(Number(period.year), Number(period.month));
  return { start: dates[0], end: dates[dates.length - 1], dates };
}

async function approvedEventsForPeriod(strapi: any, period: any) {
  const requests = await strapi.db.query(REQUEST_UID).findMany({
    where: {
      type: { $in: Array.from(EVENT_TYPES) },
      status: { $in: Array.from(APPROVED_EVENT_STATUSES) },
    },
  });
  const { start, end } = periodRange(period);
  return (requests || []).filter((request: any) => {
    const startDate = cleanArtString(request.startDate || request.processData?.datestart || request.processData?.dateaccept).slice(0, 10);
    const endDate = cleanArtString(request.endDate || request.processData?.dateend || startDate).slice(0, 10);
    return startDate && endDate && startDate <= end && endDate >= start;
  });
}

async function syncEventsAndActual(strapi: any, period: any, user: any) {
  const days = await periodDays(strapi, Number(period.id));
  const requests = await approvedEventsForPeriod(strapi, period);
  const dayEvents = new Map<string, any[]>();

  for (const request of requests) {
    const personnelNumber = cleanArtString(request.employeePersonnelNumber || request.onecPayload?.PersonId);
    if (!personnelNumber) continue;
    const relevantEmployee = days.some((day: any) => cleanArtString(day.personnelNumber) === personnelNumber);
    if (!relevantEmployee) continue;
    const startDate = cleanArtString(request.startDate || request.processData?.datestart || request.processData?.dateaccept).slice(0, 10);
    const endDate = cleanArtString(request.endDate || request.processData?.dateend || startDate).slice(0, 10);
    const code = eventDayCode(request.type);
    if (!startDate || !endDate || !code) continue;

    const eventKey = `${period.periodKey}:${request.requestNumber}:${personnelNumber}`;
    const existing = await strapi.db.query(EVENT_UID).findOne({ where: { eventKey } });
    const eventData = {
      eventKey,
      period: Number(period.id),
      type: request.type,
      status: 'APPLIED',
      personnelNumber,
      employeeName: request.employeeName,
      startDate,
      endDate,
      dayCode: code,
      sourceRequestId: Number(request.id),
      sourceRequestNumber: request.requestNumber,
      documentAttached: Boolean(request.processData?.document || request.processData?.attachment),
      metadata: { requestStatus: request.status, processData: request.processData || {} },
    };
    if (existing) {
      await strapi.db.query(EVENT_UID).update({ where: { id: existing.id }, data: eventData });
    } else {
      await strapi.db.query(EVENT_UID).create({ data: eventData });
    }

    for (const day of days) {
      if (cleanArtString(day.personnelNumber) !== personnelNumber || !isDateInRange(day.date, startDate, endDate)) continue;
      const key = `${personnelNumber}:${day.date}`;
      dayEvents.set(key, [...(dayEvents.get(key) || []), { request, code }]);
    }
  }

  const codes = policyCodes(await activePolicy(strapi));
  for (const day of days) {
    if (day.actualManualOverride === true) continue;
    const events = dayEvents.get(`${day.personnelNumber}:${day.date}`) || [];
    const distinctCodes = Array.from(new Set(events.map((event) => event.code)));
    if (distinctCodes.length > 1) {
      await strapi.db.query(DAY_UID).update({
        where: { id: day.id },
        data: {
          actualCode: 'UNASSIGNED',
          actualHours: 0,
          sourceType: 'SYSTEM',
          eventType: 'CONFLICT',
          sourceRequestNumber: events.map((item) => item.request.requestNumber).join(', '),
          editedByName: userName(user),
          version: numeric(day.version, 1) + 1,
        },
      });
      continue;
    }
    const event = events[0];
    const code = event?.code || day.plannedCode;
    const hours = event ? codeDefaultHours(code, codes) : decimal(day.plannedHours);
    await strapi.db.query(DAY_UID).update({
      where: { id: day.id },
      data: {
        actualCode: code,
        actualHours: hours,
        sourceType: event ? 'BPM_EVENT' : 'SCHEDULE',
        eventType: event?.request?.type || null,
        sourceRequestNumber: event?.request?.requestNumber || null,
        editedByName: userName(user),
        version: numeric(day.version, 1) + 1,
      },
    });
  }

  return await refreshPeriodSummary(strapi, period);
}

function oneCDate(value: Date | string): string {
  const raw = typeof value === 'string' ? value.slice(0, 10) : artDateString(value);
  return raw.replace(/-/g, '');
}

function buildOneCTimesheetPayload(period: any, days: any[], policy: any) {
  const mappings = policy?.onecMappings?.dayCodes || {};
  const usedCodes = Array.from(new Set(
    days.map((day) => cleanArtString(day.actualCode)).filter(Boolean)
  ));
  const missingMappings = usedCodes.filter((code) => !cleanArtString(mappings[code]));
  if (missingMappings.length > 0) {
    throw new Error(`Не настроены коды 1С для табеля: ${missingMappings.join(', ')}`);
  }
  const grouped = new Map<string, any>();
  for (const day of days) {
    const person = grouped.get(day.personnelNumber) || {
      PersonId: cleanArtString(day.personnelNumber),
      EmployeeName: cleanArtString(day.employeeName),
    };
    const number = Number(day.date.slice(8, 10));
    const rawCode = cleanArtString(day.actualCode);
    person[`day${number}`] = cleanArtString(mappings[rawCode]);
    person[`hours${number}`] = decimal(day.actualHours);
    grouped.set(day.personnelNumber, person);
  }
  return {
    docNumber: period.periodKey,
    docDate: oneCDate(new Date()),
    month: `${period.year}${String(period.month).padStart(2, '0')}`,
    division: cleanArtString(period.departmentId || period.departmentName),
    persons: Array.from(grouped.values()),
  };
}

async function callOneCTimesheet(period: any, payload: any) {
  const endpoint = cleanArtString(process.env.ONEC_BPM_REQUEST_URL)
    || `${cleanArtString(process.env.ONEC_API_URL).replace(/\/+$/, '')}/Request`;
  const username = cleanArtString(process.env.ONEC_API_USER);
  const password = String(process.env.ONEC_API_PASSWORD || '');
  if (!endpoint || !username || !password) {
    throw new Error('ONEC_BPM_REQUEST_URL, ONEC_API_USER и ONEC_API_PASSWORD должны быть настроены');
  }
  const url = new URL(endpoint);
  url.searchParams.set('Command', 'Create');
  url.searchParams.set('Type', '11');
  const timeoutMs = Math.max(5000, Math.min(numeric(process.env.ONEC_API_TIMEOUT_MS, 120000), 300000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(body?.message || body?.description || text || `1С вернула HTTP ${response.status}`);
    const code = Number(body?.code ?? body?.Code ?? body?.resultCode ?? 1);
    if (Number.isFinite(code) && ![1, 3].includes(code)) {
      throw new Error(body?.description || body?.message || `1С вернула код ${code}`);
    }
    return body;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error(`1С не ответила за ${timeoutMs} мс`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildKpiPayload(period: any, policy: any) {
  const snapshot = Array.isArray(period.finalSnapshot) ? period.finalSnapshot : [];
  if (snapshot.length === 0 || !cleanArtString(period.sourceHash)) {
    throw new Error('У периода нет зафиксированной утверждённой ревизии табеля');
  }
  const grouped = new Map<string, any>();
  for (const day of snapshot) {
    const personnelNumber = cleanArtString(day.personnelNumber);
    if (!personnelNumber) continue;
    const employee = grouped.get(personnelNumber) || {
      personnelNumber,
      fio: cleanArtString(day.employeeName),
      department: cleanArtString(period.departmentName),
      scheduleKind: cleanArtString(day.scheduleKind),
      days: [],
    };
    employee.days.push({
      date: cleanArtString(day.date).slice(0, 10),
      plannedCode: cleanArtString(day.plannedCode),
      plannedHours: decimal(day.plannedHours),
      actualCode: cleanArtString(day.actualCode),
      actualHours: decimal(day.actualHours),
      nightHours: decimal(day.nightHours),
      overtimeHours: decimal(day.overtimeHours),
      holidayHours: decimal(day.holidayHours),
    });
    grouped.set(personnelNumber, employee);
  }
  return {
    source: {
      system: 'BPM_ART',
      periodId: Number(period.id),
      periodKey: cleanArtString(period.periodKey),
      revision: numeric(period.revision, 1),
      hash: cleanArtString(period.sourceHash),
      approvedAt: period.approvedAt,
      onecDocumentNumber: period.onecDocumentNumber,
    },
    year: Number(period.year),
    month: Number(period.month),
    department: cleanArtString(period.departmentName),
    departmentId: cleanArtString(period.departmentId),
    holidays: Array.isArray(policy?.holidayDates) ? policy.holidayDates : [],
    employees: Array.from(grouped.values()),
  };
}

async function callKpiImport(payload: any) {
  const root = cleanArtString(process.env.KPI_API_URL).replace(/\/+$/, '');
  const token = String(process.env.INTERNAL_SYNC_TOKEN || '');
  if (!root || !token) {
    throw new Error('KPI_API_URL и INTERNAL_SYNC_TOKEN должны быть настроены в server-bpm');
  }
  const endpoint = `${root.endsWith('/api') ? root : `${root}/api`}/kpi-calculator/import-art`;
  const timeoutMs = Math.max(5000, Math.min(numeric(process.env.KPI_API_TIMEOUT_MS, 120000), 300000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Internal-Token': token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) {
      const details = Array.isArray(body?.details)
        ? body.details.map((item: any) => `${item.fio || 'Сотрудник'}: ${item.details || item.type}`).join('; ')
        : '';
      throw new Error(details || body?.error || body?.message || text || `KPI вернул HTTP ${response.status}`);
    }
    return body?.data || body;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error(`KPI не ответил за ${timeoutMs} мс`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async departments(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const [cards, configuredDepartments] = await Promise.all([
      strapi.db.query(CARD_UID).findMany({ where: { active: true } }),
      accessDepartments(strapi),
    ]);
    const values = new Map<string, any>();
    for (const card of cards) {
      for (const workplace of Array.isArray(card.workplaces) ? card.workplaces : []) {
        const name = cleanArtString(workplace?.department);
        const id = cleanArtString(workplace?.departmentId);
        if (!name) continue;
        const key = id || normalized(name);
        const item = values.get(key) || {
          id,
          name,
          organizationId: cleanArtString(workplace?.organizationId),
          organizationName: cleanArtString(workplace?.organization) || 'АО «ННМЦ»',
          employeeNumbers: new Set<string>(),
        };
        if (workplaceActiveInMonth(workplace, new Date().getFullYear(), new Date().getMonth() + 1)) {
          item.employeeNumbers.add(cleanArtString(workplace?.personnelNumber));
        }
        values.set(key, item);
      }
    }
    const data = Array.from(values.values())
      .map((item) => {
        const configured = (configuredDepartments || [])
          .find((department: any) => accessDepartmentMatches(department, item.id, item.name));
        return {
          ...item,
          employeeCount: item.employeeNumbers.size,
          employeeNumbers: undefined,
          canCreate: canCreateDepartment(user, configured),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    ctx.body = {
      data,
      meta: { canCreate: data.some((item) => item.canCreate) },
    };
  },

  async find(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const where: any = {};
    if (numeric(ctx.query.year)) where.year = numeric(ctx.query.year);
    if (numeric(ctx.query.month)) where.month = numeric(ctx.query.month);
    if (cleanArtString(ctx.query.departmentId)) where.departmentId = cleanArtString(ctx.query.departmentId);
    const [periods, configuredDepartments] = await Promise.all([
      strapi.db.query(PERIOD_UID).findMany({
        where,
        populate: ['ownerUser', 'responsibleUser', 'managerUser'],
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { departmentName: 'asc' }],
      }),
      accessDepartments(strapi),
    ]);
    ctx.body = {
      data: (periods || []).filter((period: any) => canAccessPeriod(period, user)).map((period: any) => formatPeriod(period, user)),
      meta: {
        canCreate: user.isSuperAdmin === true
          || departmentKey(user) === HR_KEY
          || (configuredDepartments || []).some((department: any) => canCreateDepartment(user, department)),
      },
    };
  },

  async create(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const body = ctx.request.body || {};
    const year = numeric(body.year);
    const month = numeric(body.month);
    const departmentId = cleanArtString(body.departmentId);
    const departmentName = cleanArtString(body.departmentName);
    if (year < 2020 || year > 2100 || month < 1 || month > 12 || !departmentName) {
      ctx.throw(400, 'Укажите корректные год, месяц и подразделение');
    }
    const configuredDepartments = await accessDepartments(strapi);
    const accessDepartment = (configuredDepartments || [])
      .find((department: any) => accessDepartmentMatches(department, departmentId, departmentName));
    if (!canCreateDepartment(user, accessDepartment)) {
      ctx.throw(403, 'Создать график может HR, супер-администратор или назначенный ответственный подразделения');
    }
    const periodKey = normalizedPeriodKey(year, month, departmentId, departmentName);
    const duplicate = await strapi.db.query(PERIOD_UID).findOne({ where: { periodKey } });
    if (duplicate) ctx.throw(409, 'Период АРТ для этого подразделения и месяца уже существует');

    const cards = await strapi.db.query(CARD_UID).findMany({ where: { active: true } });
    const employees: Array<{ card: any; workplace: any }> = [];
    const seen = new Set<string>();
    for (const card of cards) {
      for (const workplace of Array.isArray(card.workplaces) ? card.workplaces : []) {
        const personnelNumber = cleanArtString(workplace?.personnelNumber);
        if (!personnelNumber || seen.has(personnelNumber)) continue;
        if (!workplaceMatches(workplace, departmentId, departmentName) || !workplaceActiveInMonth(workplace, year, month)) continue;
        seen.add(personnelNumber);
        employees.push({ card, workplace });
      }
    }
    if (employees.length === 0) ctx.throw(400, 'В подразделении не найдено активных сотрудников из карточек 1С');

    const managerId = relationId(accessDepartment?.bpmManager);
    const responsibleId = relationId(accessDepartment?.artResponsible);
    const now = new Date().toISOString();
    const period = await strapi.entityService.create(PERIOD_UID, {
      data: {
        periodKey,
        year,
        month,
        organizationId: cleanArtString(body.organizationId || employees[0]?.workplace?.organizationId),
        organizationName: cleanArtString(body.organizationName || employees[0]?.workplace?.organization) || 'АО «ННМЦ»',
        departmentId,
        departmentName,
        status: 'DRAFT',
        phase: 'PLAN',
        revision: 1,
        employeeCount: employees.length,
        locked: false,
        history: [{
          at: now,
          by: userName(user),
          action: 'created',
          label: 'Создан график работы',
          fromStatus: null,
          toStatus: 'DRAFT',
          revision: 1,
        }],
        ownerUser: Number(user.id),
        ...(responsibleId ? { responsibleUser: responsibleId } : {}),
        ...(managerId ? { managerUser: managerId } : {}),
      } as any,
    });

    const policy = await activePolicy(strapi);
    const holidays = Array.isArray(policy.holidayDates) ? policy.holidayDates : [];
    try {
      for (const { card, workplace } of employees) {
        const scheduleKind = classifySchedule(workplace.schedule);
        for (const date of eachDateInMonth(year, month)) {
          const planned = plannedDayForDate({ date, scheduleKind, holidayDates: holidays });
          await strapi.db.query(DAY_UID).create({
            data: {
              dayKey: `${periodKey}:${workplace.personnelNumber}:${date}`,
              period: Number(period.id),
              employeeCard: Number(card.id),
              employeeIin: card.iin,
              physicalPersonId: card.physicalPersonId,
              personnelNumber: workplace.personnelNumber,
              employeeName: card.fio,
              positionName: workplace.position,
              scheduleName: workplace.schedule,
              scheduleKind,
              date,
              plannedCode: planned.code,
              plannedStart: planned.start,
              plannedEnd: planned.end,
              plannedHours: planned.hours,
              actualCode: null,
              actualHours: 0,
              sourceType: 'SCHEDULE',
              plannedManualOverride: false,
              actualManualOverride: false,
              version: 1,
              editedByName: userName(user),
            },
          });
        }
      }
    } catch (error) {
      await strapi.db.query(DAY_UID).deleteMany({ where: { period: { id: Number(period.id) } } });
      await strapi.db.query(PERIOD_UID).delete({ where: { id: Number(period.id) } });
      throw error;
    }
    const refreshed = await loadPeriod(strapi, period.id);
    await refreshPeriodSummary(strapi, refreshed);
    ctx.body = { data: formatPeriod(await loadPeriod(strapi, period.id), user) };
  },

  async findOne(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!canAccessPeriod(period, user)) ctx.throw(403, 'Нет доступа к периоду АРТ');
    const days = await periodDays(strapi, Number(period.id));
    const policy = await activePolicy(strapi);
    const events = await strapi.db.query(EVENT_UID).findMany({
      where: { period: { id: Number(period.id) } },
      orderBy: [{ startDate: 'asc' }],
    });
    ctx.body = {
      data: {
        period: formatPeriod(period, user),
        days: days.map(formatDay),
        events,
        policy: {
          id: policy.id,
          policyKey: policy.policyKey,
          name: policy.name,
          version: policy.version,
          dayCodes: policyCodes(policy),
          holidayDates: policy.holidayDates || [],
          onecMappings: policy.onecMappings || {},
        },
      },
    };
  },

  async updateDays(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!canAccessPeriod(period, user) || !canEditPeriod(period, user)) ctx.throw(403, 'Нет прав на изменение табеля');
    if (period.locked) ctx.throw(409, 'Утверждённый табель заблокирован. Новую ревизию может открыть супер-администратор');
    const body = ctx.request.body || {};
    if (numeric(body.revision) !== numeric(period.revision)) {
      ctx.throw(409, 'Табель уже изменён другим пользователем. Обновите страницу');
    }
    const phase = cleanArtString(body.phase).toUpperCase();
    const canEditPlan = phase === 'PLAN' && period.phase === 'PLAN' && ['DRAFT', 'RETURNED'].includes(period.status);
    const canEditActual = phase === 'ACTUAL' && period.phase === 'ACTUAL' && ['ACTIVE', 'RETURNED'].includes(period.status);
    if (!canEditPlan && !canEditActual) ctx.throw(409, 'Текущий этап не допускает редактирование этих данных');
    const policy = await activePolicy(strapi);
    const codes = policyCodes(policy);
    const allowedCodes = new Set(codes.map((item) => item.code));
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 5000) : [];
    if (changes.length === 0) ctx.throw(400, 'Нет изменений для сохранения');

    for (const change of changes) {
      const id = numeric(change.id);
      const code = cleanArtString(change.code).toUpperCase();
      if (!id || !allowedCodes.has(code)) ctx.throw(400, `Недопустимый код дня: ${code || '-'}`);
      const day = await strapi.db.query(DAY_UID).findOne({ where: { id, period: { id: Number(period.id) } } });
      if (!day) ctx.throw(404, `Строка табеля ${id} не найдена`);
      const hours = change.hours === undefined ? codeDefaultHours(code, codes) : Math.max(0, Math.min(decimal(change.hours), 24));
      const reason = cleanArtString(change.reason);
      const data = canEditPlan
        ? {
            plannedCode: code,
            plannedHours: hours,
            plannedStart: cleanArtString(change.start) || null,
            plannedEnd: cleanArtString(change.end) || null,
            sourceType: 'MANUAL',
            plannedManualOverride: true,
            overrideReason: reason,
            editedByName: userName(user),
            version: numeric(day.version, 1) + 1,
          }
        : {
            actualCode: code,
            actualHours: hours,
            nightHours: Math.max(0, Math.min(decimal(change.nightHours), 24)),
            overtimeHours: Math.max(0, Math.min(decimal(change.overtimeHours), 24)),
            holidayHours: Math.max(0, Math.min(decimal(change.holidayHours), 24)),
            sourceType: 'MANUAL',
            manualOverride: true,
            actualManualOverride: true,
            overrideReason: reason,
            editedByName: userName(user),
            version: numeric(day.version, 1) + 1,
          };
      await strapi.db.query(DAY_UID).update({ where: { id }, data });
    }

    await refreshPeriodSummary(strapi, period);
    const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
      data: { revision: numeric(period.revision, 1) + 1 } as any,
    });
    ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
  },

  async generateActual(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!canAccessPeriod(period, user) || !canEditPeriod(period, user)) ctx.throw(403, 'Нет прав на формирование фактического табеля');
    if (period.phase !== 'ACTUAL' || !['ACTIVE', 'RETURNED'].includes(period.status)) {
      ctx.throw(409, 'Фактический табель можно сформировать только после утверждения графика');
    }
    await syncEventsAndActual(strapi, period, user);
    const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
      data: {
        revision: numeric(period.revision, 1) + 1,
        history: appendHistory(period, user, 'actual_generated', 'Фактический табель пересчитан по графику и утверждённым BPM-событиям', period.status, period.status),
      } as any,
    });
    ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
  },

  async applyPattern(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!canAccessPeriod(period, user) || !canEditPeriod(period, user)) ctx.throw(403, 'Нет прав на изменение графика');
    if (period.phase !== 'PLAN' || !['DRAFT', 'RETURNED'].includes(period.status) || period.locked) {
      ctx.throw(409, 'Шаблон можно применить только к редактируемому графику');
    }
    const body = ctx.request.body || {};
    if (numeric(body.revision) !== numeric(period.revision)) ctx.throw(409, 'График уже изменён. Обновите страницу');
    const personnelNumber = cleanArtString(body.personnelNumber);
    const pattern = cleanArtString(body.pattern).toUpperCase();
    if (!personnelNumber) ctx.throw(400, 'Выберите сотрудника');
    const days = (await periodDays(strapi, Number(period.id)))
      .filter((day: any) => cleanArtString(day.personnelNumber) === personnelNumber);
    if (days.length === 0) ctx.throw(404, 'Строка сотрудника в графике не найдена');

    const workingSaturday = cleanArtString(body.workingSaturday).slice(0, 10);
    const anchorDate = cleanArtString(body.anchorDate).slice(0, 10);
    const workHours = Math.max(0, Math.min(decimal(body.hours || 8), 24));
    if (pattern === 'FIVE_DAY_PLUS_SATURDAY') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workingSaturday)
        || artDate(workingSaturday).getUTCDay() !== 6
        || !days.some((day: any) => day.date === workingSaturday)) {
        ctx.throw(400, 'Выберите рабочую субботу внутри текущего месяца');
      }
    } else if (pattern === 'SHIFT_24_48') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) ctx.throw(400, 'Укажите дату первой суточной смены');
    } else if (pattern !== 'SIX_DAY') {
      ctx.throw(400, 'Неизвестный шаблон графика');
    }

    for (const day of days) {
      const weekday = artDate(day.date).getUTCDay();
      let code = 'DAY_OFF';
      let hours = 0;
      let start: string | null = null;
      let end: string | null = null;
      if (pattern === 'FIVE_DAY_PLUS_SATURDAY' && ((weekday >= 1 && weekday <= 5) || day.date === workingSaturday)) {
        code = 'WORK'; hours = workHours; start = '08:00:00'; end = '17:00:00';
      }
      if (pattern === 'SIX_DAY' && weekday !== 0) {
        code = 'WORK'; hours = workHours; start = '08:00:00'; end = null;
      }
      if (pattern === 'SHIFT_24_48') {
        const difference = Math.round((artDate(day.date).getTime() - artDate(anchorDate).getTime()) / 86400000);
        if (((difference % 3) + 3) % 3 === 0) {
          code = 'SHIFT_24'; hours = 24; start = '08:00:00'; end = '08:00:00';
        }
      }
      await strapi.db.query(DAY_UID).update({
        where: { id: day.id },
        data: {
          plannedCode: code,
          plannedHours: hours,
          plannedStart: start,
          plannedEnd: end,
          sourceType: 'MANUAL',
          plannedManualOverride: true,
          overrideReason: `Применён шаблон ${pattern}`,
          editedByName: userName(user),
          version: numeric(day.version, 1) + 1,
        },
      });
    }
    await refreshPeriodSummary(strapi, period);
    const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
      data: {
        revision: numeric(period.revision, 1) + 1,
        history: appendHistory(period, user, 'pattern_applied', `Применён шаблон графика к сотруднику ${days[0].employeeName}`, period.status, period.status, pattern),
      } as any,
    });
    ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
  },

  async transition(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!canAccessPeriod(period, user)) ctx.throw(403, 'Нет доступа к периоду АРТ');
    const body = ctx.request.body || {};
    const action = cleanArtString(body.action);
    const comment = cleanArtString(body.comment);

    if (action === 'return') {
      if (!availableActions(period, user).return) ctx.throw(403, 'Нет прав вернуть табель на исправление');
      if (!comment) ctx.throw(400, 'Укажите причину возврата');
      const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
        data: {
          status: 'RETURNED',
          returnedToStatus: period.status,
          lastDecisionComment: comment,
          revision: numeric(period.revision, 1) + 1,
          history: appendHistory(period, user, 'returned', 'Табель возвращён на исправление', period.status, 'RETURNED', comment),
        } as any,
      });
      ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
      return;
    }

    const transition = ART_TRANSITIONS[action];
    if (!transition || !transition.from.includes(period.status)) ctx.throw(409, 'Переход недоступен для текущего статуса');
    if (action === 'submit_plan' && period.phase !== 'PLAN') ctx.throw(409, 'Фактический табель нельзя отправить как график');
    if (action === 'submit_actual' && period.phase !== 'ACTUAL') ctx.throw(409, 'График нельзя отправить как фактический табель');
    if (!canActAs(period, user, transition.role)) ctx.throw(403, 'Нет прав выполнить этот этап');
    const days = await periodDays(strapi, Number(period.id));
    if (action === 'submit_plan' && days.some((day: any) => isUnresolvedCode(day.plannedCode))) {
      ctx.throw(400, 'В графике есть дни без назначенного режима работы');
    }
    if (action === 'submit_plan') {
      const validationErrors = planValidationErrors(days, await activePolicy(strapi));
      if (validationErrors.length > 0) {
        ctx.throw(400, `График не прошёл проверку: ${validationErrors.slice(0, 5).join('; ')}`);
      }
    }
    if (action === 'submit_actual' && days.some((day: any) => isUnresolvedCode(day.actualCode))) {
      ctx.throw(400, 'В фактическом табеле есть неразрешённые дни или конфликты');
    }
    if (action === 'submit_plan' && !relationId(period.managerUser) && user.isSuperAdmin !== true) {
      ctx.throw(400, 'Нельзя отправить график: для подразделения не назначен руководитель');
    }

    const now = new Date().toISOString();
    const data: any = {
      status: transition.to,
      phase: transition.phase || period.phase,
      revision: numeric(period.revision, 1) + 1,
      returnedToStatus: null,
      lastDecisionComment: comment || null,
      history: appendHistory(period, user, action, transitionLabel(action), period.status, transition.to, comment),
    };
    if (action === 'submit_plan') data.planSubmittedAt = now;
    if (action === 'approve_plan_hr') data.planApprovedAt = now;
    if (action === 'submit_actual') {
      const snapshot = days.map(formatDay);
      data.actualSubmittedAt = now;
      data.finalSnapshot = snapshot;
      data.sourceHash = sourceHash(snapshot);
    }
    if (action === 'approve_actual_hr') {
      data.approvedAt = now;
      data.locked = true;
      data.onecStatus = 'pending';
    }
    if (action === 'reopen') {
      data.locked = false;
      data.onecStatus = 'not_ready';
      data.onecError = null;
      data.kpiStatus = 'not_ready';
      data.kpiArchiveId = null;
      data.kpiResponse = null;
      data.kpiError = null;
      data.finalSnapshot = null;
      data.sourceHash = null;
    }
    if (action === 'close') data.closedAt = now;
    const updated = await strapi.entityService.update(PERIOD_UID, period.id, { data });
    ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
  },

  async sendToOneC(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!availableActions(period, user).sendToOneC) ctx.throw(403, 'Передать табель в 1С может HR или супер-администратор');
    const persistedDays = await periodDays(strapi, Number(period.id));
    const frozenDays = Array.isArray(period.finalSnapshot) ? period.finalSnapshot : [];
    const days = frozenDays.length > 0 ? frozenDays : persistedDays.map(formatDay);
    if (days.some((day: any) => isUnresolvedCode(day.actualCode))) ctx.throw(400, 'Табель содержит неразрешённые дни');
    const policy = await activePolicy(strapi);
    const payload = buildOneCTimesheetPayload(period, days, policy);
    const attemptAt = new Date().toISOString();
    const attemptCount = numeric(period.integrationAttemptCount) + 1;
    try {
      const response = await callOneCTimesheet(period, payload);
      const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
        data: {
          status: 'ONEC_SENT',
          onecStatus: 'sent',
          onecDocumentNumber: cleanArtString(response?.number || response?.documentNumber || period.periodKey),
          onecResponse: response,
          onecError: null,
          integrationAttemptCount: attemptCount,
          lastIntegrationAttemptAt: attemptAt,
          history: appendHistory(period, user, 'sent_to_onec', 'Фактический табель передан в 1С', period.status, 'ONEC_SENT'),
        } as any,
      });
      ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
    } catch (error: any) {
      const message = error?.message || String(error);
      await strapi.entityService.update(PERIOD_UID, period.id, {
        data: {
          onecStatus: 'error',
          onecError: message,
          integrationAttemptCount: attemptCount,
          lastIntegrationAttemptAt: attemptAt,
          history: appendHistory(period, user, 'onec_failed', 'Ошибка передачи табеля в 1С', period.status, period.status, message),
        } as any,
      });
      ctx.throw(502, message);
    }
  },

  async sendToKpi(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const period = await loadPeriod(strapi, ctx.params.id);
    if (!period) ctx.throw(404, 'Период АРТ не найден');
    if (!availableActions(period, user).sendToKpi) {
      ctx.throw(403, 'Передать табель в KPI может HR или супер-администратор после успешной передачи в 1С');
    }
    const policy = await activePolicy(strapi);
    const payload = buildKpiPayload(period, policy);
    const attemptAt = new Date().toISOString();
    const attemptCount = numeric(period.kpiAttemptCount) + 1;
    await strapi.entityService.update(PERIOD_UID, period.id, {
      data: {
        kpiStatus: 'pending',
        kpiError: null,
        kpiAttemptCount: attemptCount,
        lastKpiAttemptAt: attemptAt,
      } as any,
    });
    try {
      const response = await callKpiImport(payload);
      const updated = await strapi.entityService.update(PERIOD_UID, period.id, {
        data: {
          status: 'KPI_READY',
          kpiStatus: 'sent',
          kpiArchiveId: cleanArtString(response?.archiveId),
          kpiResponse: response,
          kpiError: null,
          kpiAttemptCount: attemptCount,
          lastKpiAttemptAt: attemptAt,
          history: appendHistory(
            period,
            user,
            'sent_to_kpi',
            'Утверждённый табель передан в KPI',
            period.status,
            'KPI_READY',
            response?.duplicate ? 'Повторный запрос: использован существующий архив' : ''
          ),
        } as any,
      });
      ctx.body = { data: formatPeriod({ ...period, ...updated }, user) };
    } catch (error: any) {
      const message = error?.message || String(error);
      await strapi.entityService.update(PERIOD_UID, period.id, {
        data: {
          kpiStatus: 'error',
          kpiError: message,
          kpiAttemptCount: attemptCount,
          lastKpiAttemptAt: attemptAt,
          history: appendHistory(period, user, 'kpi_failed', 'Ошибка передачи табеля в KPI', period.status, period.status, message),
        } as any,
      });
      ctx.throw(502, message);
    }
  },

  async myCalendar(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    const username = cleanArtString(user.username);
    const card = /^\d{12}$/.test(username)
      ? await strapi.db.query(CARD_UID).findOne({ where: { iin: username } })
      : await strapi.db.query(CARD_UID).findOne({ where: { user: { id: Number(user.id) } } });
    if (!card) {
      ctx.body = { data: { employee: null, days: [], periods: [] } };
      return;
    }
    const year = numeric(ctx.query.year, new Date().getFullYear());
    const month = numeric(ctx.query.month, new Date().getMonth() + 1);
    const periods = await strapi.db.query(PERIOD_UID).findMany({
      where: { year, month },
      populate: ['ownerUser', 'responsibleUser', 'managerUser'],
    });
    const days = await strapi.db.query(DAY_UID).findMany({
      where: { employeeIin: card.iin, date: { $gte: `${year}-${String(month).padStart(2, '0')}-01`, $lte: `${year}-${String(month).padStart(2, '0')}-31` } },
      orderBy: [{ personnelNumber: 'asc' }, { date: 'asc' }],
    });
    ctx.body = {
      data: {
        employee: { id: card.id, fio: card.fio, workplaces: card.workplaces || [] },
        days: days.map(formatDay),
        periods: periods.filter((period: any) => days.some((day: any) => cleanArtString(day.dayKey).startsWith(`${period.periodKey}:`))).map((period: any) => formatPeriod(period)),
      },
    };
  },

  async policy(ctx: Context) {
    const strapi = (global as any).strapi;
    await loadCurrentUser(ctx, strapi);
    const policy = await activePolicy(strapi);
    ctx.body = { data: policy };
  },

  async updatePolicy(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (user.isSuperAdmin !== true) ctx.throw(403, 'Политику АРТ может менять только супер-администратор');
    const current = await activePolicy(strapi);
    const body = ctx.request.body || {};
    const dayCodes = Array.isArray(body.dayCodes) ? body.dayCodes : policyCodes(current);
    if (!dayCodes.some((item: any) => item.code === 'UNASSIGNED')) ctx.throw(400, 'Политика должна содержать код UNASSIGNED');
    const data = {
      policyKey: cleanArtString(current.policyKey || DEFAULT_ART_POLICY.policyKey),
      name: cleanArtString(body.name || current.name || DEFAULT_ART_POLICY.name),
      active: true,
      effectiveFrom: body.effectiveFrom || current.effectiveFrom,
      effectiveTo: body.effectiveTo || null,
      dayCodes,
      scheduleRules: body.scheduleRules || current.scheduleRules || DEFAULT_ART_POLICY.scheduleRules,
      holidayDates: Array.isArray(body.holidayDates) ? body.holidayDates : current.holidayDates || [],
      onecMappings: body.onecMappings || current.onecMappings || DEFAULT_ART_POLICY.onecMappings,
      version: numeric(current.version, 1) + 1,
    };
    const updated = current.id
      ? await strapi.db.query(POLICY_UID).update({ where: { id: current.id }, data })
      : await strapi.db.query(POLICY_UID).create({ data });
    ctx.body = { data: updated };
  },
};

function transitionLabel(action: string): string {
  const labels: Record<string, string> = {
    submit_plan: 'График отправлен руководителю',
    approve_manager: 'График согласован руководителем и передан в HR',
    approve_plan_hr: 'График утверждён HR и открыт для фактического учёта',
    submit_actual: 'Фактический табель отправлен в HR',
    approve_actual_hr: 'Фактический табель утверждён HR и подготовлен к передаче в 1С',
    close: 'Период АРТ закрыт',
    reopen: 'Супер-администратор открыл новую ревизию табеля',
  };
  return labels[action] || action;
}
