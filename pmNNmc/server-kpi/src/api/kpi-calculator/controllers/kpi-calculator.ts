import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import type { Context } from 'koa';
import { parseTimesheet } from '../services/timesheet-parser';
import * as kpiCalculator from '../services/kpi-calculator';
import { buildBuhPdf, buildReportPdf, ReportSettings } from '../services/report-generator';
import { getUserAccess } from '../../../utils/access';

declare const strapi: any;

async function getFileBufferByName(ctx: Context, fieldName: string): Promise<Buffer | null> {
  const files: any = (ctx.request as any).files || {};
  let file = files[fieldName];

  if (Array.isArray(file)) {
    file = file[0];
  }

  if (!file) {
    return null;
  }

  if (file.buffer) {
    return file.buffer as Buffer;
  }

  const filepath: string | undefined = file.filepath || file.path;
  if (!filepath) {
    return null;
  }

  return fs.readFile(filepath);
}

async function getFileBufferFromCtx(ctx: Context): Promise<Buffer> {
  const buf = await getFileBufferByName(ctx, 'timesheet');
  if (!buf) {
    throw new Error('Файл табеля (timesheet) не загружен');
  }
  return buf;
}

function parseHolidays(raw: any): (string | number)[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  const s = String(raw).trim();
  if (!s) return [];

  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore JSON errors, fallback below
    }
  }

  return s
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeHolidayInput(
  raw: string | number,
  year: number,
  month: number
): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (raw >= 1 && raw <= 31) {
      const dd = String(raw).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  if (s.includes('-')) {
    const parts = s.split('T')[0].split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (y === year && m === month && d >= 1 && d <= 31) {
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      }
    }
    return null;
  }

  if (/^\d+$/.test(s)) {
    const d = parseInt(s, 10);
    if (d >= 1 && d <= 31) {
      const dd = String(d).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  return null;
}

async function loadHolidayDates(ctx: Context, year: number, month: number): Promise<string[]> {
  const strapiHolidays = await strapi.entityService.findMany('api::holiday.holiday', {
    filters: {
      year: { $eq: year },
      month: { $eq: month },
    },
    fields: ['date', 'year', 'month'],
    pagination: { pageSize: 1000 },
  });

  const strapiHolidayDates: string[] = [];
  (strapiHolidays || []).forEach((h: any) => {
    const dateValue = h.date;
    if (dateValue) {
      strapiHolidayDates.push(String(dateValue));
    }
  });

  const formHolidays = parseHolidays(getRequestField(ctx, 'holidays'));
  const normalized = [
    ...strapiHolidayDates
      .map((x) => normalizeHolidayInput(x, year, month))
      .filter(Boolean),
    ...formHolidays
      .map((x) => normalizeHolidayInput(x, year, month))
      .filter(Boolean),
  ];

  return Array.from(new Set(normalized as string[]));
}

function getLastWorkingDate(year: number, month: number, holidays: string[]): string {
  const holidaySet = new Set(holidays || []);
  const lastDay = new Date(year, month, 0).getDate();

  for (let d = lastDay; d >= 1; d--) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    const dd = String(d).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const key = `${year}-${mm}-${dd}`;

    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (holidaySet.has(key)) continue;
    return key;
  }

  const dd = String(lastDay).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

async function loadReportSettings(): Promise<ReportSettings | null> {
  try {
    const raw: any = await strapi.entityService.findMany('api::report-setting.report-setting', {
      populate: {
        commissionMembers: true,
        meetingDateOverrides: true,
      },
    });

    const entity = Array.isArray(raw) ? raw[0] : raw;
    if (!entity) return null;

    const data = entity?.attributes ? { ...entity.attributes } : { ...entity };
    return data as ReportSettings;
  } catch {
    return null;
  }
}

/**
 * Load per-department template. Falls back to global report-setting if not found.
 */
async function loadDepartmentTemplate(department: string): Promise<ReportSettings | null> {
  if (!department) return null;
  try {
    const results: any = await (strapi.entityService as any).findMany(
      'api::department-template.department-template',
      {
        filters: { departmentKey: department },
        populate: {
          commissionMembers: true,
          meetingDateOverrides: true,
        },
        limit: 1,
      }
    );
    const entity = Array.isArray(results) ? results[0] : results;
    if (!entity) return null;
    const data = entity?.attributes ? { ...entity.attributes } : { ...entity };
    return data as ReportSettings;
  } catch {
    return null;
  }
}

/**
 * Load settings with priority: department-template > global report-setting > defaults
 */
async function loadSettingsForDepartment(department: string): Promise<ReportSettings> {
  const deptTemplate = await loadDepartmentTemplate(department);
  if (deptTemplate) {
    return applyReportDefaults(deptTemplate);
  }
  const globalSettings = await loadReportSettings();
  return applyReportDefaults(globalSettings);
}

const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  protocolNumber: '1',
  meetingTitle: 'Заседания комиссии по оплате и мотивации труда персонала',
  departmentTitle: 'Отдел централизованный медицинский клининг-1',
  place: 'г.Астана, пр.Абылай – хана 42',
  agendaText:
    'Рассмотрение итогов работы за {{month}} месяц {{year}} года. Оценка достижения ключевых показателей работы эффективности выполнения внутренних стандартов, санитарно-эпидемиологического режима и трудовой дисциплины, степень достижения КПР каждым сотрудником {{department}}.\n' +
    'Результаты фактического исполнения целевых показателей КПР за {{month}} месяц {{year}} года в соответствии с утверждённым Положением об оплате труда.',
  footerText:
    'Передать отделу бухгалтерии результаты рассмотрения стимулирующих и мотивирующих компонентов для своевременного начисления.',
  commissionMembers: [
    { role: 'Председатель', name: 'Нурсейтова Т.Б.' },
    { role: 'Руководитель по сестринскому делу', name: 'Мусабаева А.М' },
    { role: 'Руководитель отдела управления', name: 'Кенжебаева Ш.Т' },
    { role: 'Главный экономист', name: 'Мендыбаева Э.М' },
    { role: 'Главный бухгалтер', name: 'Тасеменова Д.К' },
  ],
  secretaryName: '',
  coordinatorRole: '',
};

function applyReportDefaults(settings?: ReportSettings | null): ReportSettings {
  return {
    ...DEFAULT_REPORT_SETTINGS,
    ...(settings || {}),
    commissionMembers:
      settings?.commissionMembers && settings.commissionMembers.length > 0
        ? settings.commissionMembers
        : DEFAULT_REPORT_SETTINGS.commissionMembers,
  };
}

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function formatDateRu(dateStr: string): string {
  const [y, m, d] = String(dateStr).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return dateStr;
  const monthName = MONTHS_GENITIVE[m - 1] || '';
  return `${d} ${monthName} ${y}`;
}

function applyTemplate(text: string, vars: Record<string, string>): string {
  return Object.keys(vars).reduce((acc, key) => {
    return acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), vars[key]);
  }, text);
}

function resolveMeetingDateOverride(
  settings: ReportSettings | null,
  year: number,
  month: number
): string | null {
  const overrides = settings?.meetingDateOverrides || [];
  for (const item of overrides as any[]) {
    const y = item?.year ? parseInt(String(item.year), 10) : 0;
    const m = item?.month ? parseInt(String(item.month), 10) : 0;
    if (y === year && m === month && item?.date) {
      return String(item.date).split('T')[0];
    }
  }
  return null;
}
function getBodyField(body: any, key: string): any {
  if (!body) return undefined;

  if (body[key] !== undefined) {
    const val = body[key];
    return Array.isArray(val) ? val[0] : val;
  }

  const data = body.data;
  if (data !== undefined && data !== null) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed && parsed[key] !== undefined) {
          const val = parsed[key];
          return Array.isArray(val) ? val[0] : val;
        }
      } catch {
        // ignore parse errors
      }
    } else if (typeof data === 'object' && data[key] !== undefined) {
      const val = data[key];
      return Array.isArray(val) ? val[0] : val;
    }
  }

  const fields = body.fields;
  if (fields && typeof fields === 'object' && fields[key] !== undefined) {
    const val = fields[key];
    return Array.isArray(val) ? val[0] : val;
  }

  return undefined;
}

function getRequestField(ctx: Context, key: string): any {
  const body: any = (ctx.request as any).body || {};
  const fromBody = getBodyField(body, key);
  if (fromBody !== undefined && String(fromBody).trim() !== '') {
    return fromBody;
  }

  const queryValue: any =
    (ctx.request as any).query?.[key] ?? (ctx as any).query?.[key];
  if (queryValue !== undefined) {
    return Array.isArray(queryValue) ? queryValue[0] : queryValue;
  }

  const headerKey = `x-kpi-${key}`.toLowerCase();
  const headerValue = (ctx.request as any).headers?.[headerKey];
  if (headerValue !== undefined) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  return undefined;
}

function normalizeDepartment(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-–—_]+/g, '');
}

function isNumericValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().replace(',', '.');
  if (!s) return false;
  const num = parseFloat(s);
  return !isNaN(num);
}

function aggregateDayValues(dayValues: any[]): {
  letters_weekday: number;
  letters_sat: number;
  letters_sun: number;
  letters_holiday: number;
  numbers_weekday: number;
  numbers_sat: number;
  numbers_sun: number;
  numbers_holiday: number;
} {
  const out = {
    letters_weekday: 0,
    letters_sat: 0,
    letters_sun: 0,
    letters_holiday: 0,
    numbers_weekday: 0,
    numbers_sat: 0,
    numbers_sun: 0,
    numbers_holiday: 0,
  };
  for (const dv of dayValues || []) {
    const raw = dv?.value;
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const isNum = isNumericValue(raw);
    const dayType = String(dv?.dayType || 'weekday');
    const bucket = isNum ? 'numbers' : 'letters';
    const key = `${bucket}_${dayType}` as keyof typeof out;
    if (key in out) {
      out[key] = (out[key] as number) + 1;
    }
  }
  return out;
}

async function calcCore(ctx: Context) {
  const body: any = (ctx.request as any).body || {};
  const access = await getUserAccess(ctx);
  const requestedDepartment = String(getRequestField(ctx, 'department') || '').trim();
  const allowedDepartments = access.allowedDepartments || [];
  const normalizedAllowed = allowedDepartments.map(normalizeDepartment).filter(Boolean);
  const debugEnabled = String(getRequestField(ctx, 'debug') || '').trim() === '1';
  const debug: any = debugEnabled
    ? {
        serverTime: new Date().toISOString(),
        rawBodyKeys: Object.keys(body || {}),
        bodyDepartment: body?.department,
        bodyDataType: typeof body?.data,
        bodyFieldsKeys: body?.fields ? Object.keys(body.fields) : [],
        requestedDepartment,
        allowedDepartments,
        normalizedAllowed,
      }
    : null;
  const withDebug = (payload: any) => (debug ? { ...payload, debug } : payload);

  if (!access.isAdmin) {
    if (normalizedAllowed.length === 0) {
      ctx.throw(403, 'Нет доступных отделов');
    }
    if (!requestedDepartment) {
      ctx.throw(400, 'Отдел для расчёта не указан');
    }
    if (requestedDepartment) {
      const requestedNorm = normalizeDepartment(requestedDepartment);
      if (!normalizedAllowed.includes(requestedNorm)) {
        ctx.throw(403, 'Нет доступа к указанному отделу');
      }
    }
  }

  const nchDay = parseInt(getRequestField(ctx, 'nchDay') || '0', 10) || 0;
  const ndShift = parseInt(getRequestField(ctx, 'ndShift') || '0', 10) || 0;

  if (nchDay <= 0 && ndShift <= 0) {
    throw new Error('Нужно указать Н.ч для дневных и/или Н.д для суточных');
  }

  const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
  const month = parseInt(getRequestField(ctx, 'month') || '0', 10);

  if (!year || !month || month < 1 || month > 12) {
    throw new Error('Некорректные значения года или месяца');
  }

  // Загружаем праздники из Strapi для указанного года/месяца
  const strapiHolidays = await strapi.entityService.findMany('api::holiday.holiday', {
    filters: {
      year: { $eq: year },
      month: { $eq: month },
    },
    fields: ['date', 'year', 'month'],
    pagination: { pageSize: 1000 },
  });

  // Преобразуем в массив дат (entityService возвращает объекты напрямую)
  const strapiHolidayDates: string[] = [];
  (strapiHolidays || []).forEach((h: any) => {
    // entityService.findMany возвращает объекты напрямую: { id, date, year, month, ... }
    const dateValue = h.date;
    if (dateValue) {
      strapiHolidayDates.push(String(dateValue));
    }
  });

  // Объединяем с праздниками из формы (если есть)
  const formHolidays = parseHolidays(getRequestField(ctx, 'holidays'));
  const allHolidays = [...new Set([...strapiHolidayDates, ...formHolidays])];

  // --- Two-file parsing: prev month (25-end) + current month (1-25) ---
  const fileBuffer = await getFileBufferFromCtx(ctx);
  const prevFileBuffer = await getFileBufferByName(ctx, 'timesheetPrev');

  let parsedEmployees;

  if (prevFileBuffer) {
    // Calculate previous month/year
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    // Load holidays for previous month too
    const prevStrapiHolidays = await strapi.entityService.findMany('api::holiday.holiday', {
      filters: {
        year: { $eq: prevYear },
        month: { $eq: prevMonth },
      },
      fields: ['date', 'year', 'month'],
      pagination: { pageSize: 1000 },
    });
    const prevHolidayDates: string[] = [];
    (prevStrapiHolidays || []).forEach((h: any) => {
      if (h.date) prevHolidayDates.push(String(h.date));
    });
    const allPrevHolidays = [...new Set(prevHolidayDates)];

    // Parse prev month: days 25 to end
    const prevParsed = await parseTimesheet(prevFileBuffer, prevYear, prevMonth, allPrevHolidays, { dayFrom: 25, dayTo: 31 });
    // Parse current month: days 1 to 25
    const currParsed = await parseTimesheet(fileBuffer, year, month, allHolidays, { dayFrom: 1, dayTo: 25 });

    // Merge by FIO
    parsedEmployees = kpiCalculator.mergeEmployees(prevParsed, currParsed);
  } else {
    // Fallback: single file mode (backwards compatibility)
    parsedEmployees = await parseTimesheet(fileBuffer, year, month, allHolidays);
  }
  const parsedDeptSamples = parsedEmployees
    .map((e: any) => String(e?.department || '').trim())
    .filter(Boolean);
  if (debug) {
    debug.timesheetDeptSample = Array.from(new Set(parsedDeptSamples)).slice(0, 12);
  }

  let employees = parsedEmployees;


  const kpiFilters: any = {};
  if (!access.isAdmin && allowedDepartments.length > 0) {
    kpiFilters.department = { $in: allowedDepartments };
  }

  const kpiQuery: any = {
    fields: ['id', 'fio', 'kpiSum', 'scheduleType', 'department', 'categoryCode'],
    publicationState: 'live',
    pagination: { pageSize: 10000 },
  };
  if (Object.keys(kpiFilters).length > 0) {
    kpiQuery.filters = kpiFilters;
  }

  const kpiTable = await strapi.entityService.findMany('api::employee.employee', kpiQuery);
  const kpiDeptSamples = (kpiTable || [])
    .map((e: any) => String(e?.department || '').trim())
    .filter(Boolean);
  if (debug) {
    debug.kpiDeptSample = Array.from(new Set(kpiDeptSamples)).slice(0, 12);
  }

  let finalEmployees = employees;
  let finalKpiTable = kpiTable;

  if (requestedDepartment) {
    const target = normalizeDepartment(requestedDepartment);
    finalKpiTable = (kpiTable || []).filter(
      (item: any) => normalizeDepartment(item?.department) === target
    );

    const kpiFioSet = new Set(
      finalKpiTable.map((item: any) => String(item?.fio || '').trim().toLowerCase()).filter(Boolean)
    );

    finalEmployees = employees.filter((emp: any) =>
      kpiFioSet.has(String(emp?.fio || '').trim().toLowerCase())
    );

    if (finalEmployees.length === 0) {
      return withDebug({
        results: [],
        errors: [
          {
            fio: '',
            type: 'NO_EMPLOYEES',
            details: `Нету никого в отделе ${requestedDepartment}`,
          },
        ],
      });
    }
  }

  let { results, errors } = kpiCalculator.calculateKPI(
    finalEmployees,
    finalKpiTable,
    nchDay,
    ndShift
  );

  if (requestedDepartment) {
    const target = normalizeDepartment(requestedDepartment);
    const filteredResults = (results || []).filter(
      (r: any) => normalizeDepartment(r?.department) === target
    );
    if (filteredResults.length === 0) {
      return withDebug({
        results: [],
        errors: [
          {
            fio: '',
            type: 'NO_EMPLOYEES',
            details: `Нету никого в отделе ${requestedDepartment}`,
          },
        ],
      });
    }
    results = filteredResults;
  }

  // Build parsed details for the "Результаты" tab
  const parsedDetails = finalEmployees.map((emp: any) => ({
    fio: emp.fio,
    department: emp.department || '',
    letters_weekday: emp.letters_weekday || 0,
    letters_sat: emp.letters_sat || 0,
    letters_sun: emp.letters_sun || 0,
    letters_holiday: emp.letters_holiday || 0,
    numbers_weekday: emp.numbers_weekday || 0,
    numbers_sat: emp.numbers_sat || 0,
    numbers_sun: emp.numbers_sun || 0,
    numbers_holiday: emp.numbers_holiday || 0,
    dayValues: emp.dayValues || [],
  }));

  return withDebug({ results, errors, parsedDetails });
}

export default {
  async calculate(ctx: Context) {
    try {
      const payload = await calcCore(ctx);

      // Save to archive
      try {
        const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
        const month = parseInt(getRequestField(ctx, 'month') || '0', 10);
        const department = String(getRequestField(ctx, 'department') || '').trim();
        const nchDay = parseInt(getRequestField(ctx, 'nchDay') || '0', 10) || 0;
        const ndShift = parseInt(getRequestField(ctx, 'ndShift') || '0', 10) || 0;
        const currentUser = (ctx.state as any)?.user;
        const calculatedBy = currentUser?.username || currentUser?.email || 'unknown';

        if (payload.results && payload.results.length > 0) {
          await strapi.entityService.create('api::calculation-archive.calculation-archive', {
            data: {
              year,
              month,
              department,
              nchDay,
              ndShift,
              calculatedBy,
              results: payload.results,
              parsedDetails: payload.parsedDetails || [],
              errors: payload.errors || [],
              employeeCount: payload.results.length,
            },
          });
        }
      } catch (archiveErr: any) {
        // Don't fail the calculation if archive save fails
        console.error('Failed to save calculation archive:', archiveErr?.message);
      }

      ctx.body = payload;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка расчёта KPI' };
    }
  },

  async downloadExcel(ctx: Context) {
    try {
      const { results, errors } = await calcCore(ctx);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('KPI');

      worksheet.columns = [
        { header: '#', key: 'idx', width: 5 },
        { header: 'ФИО', key: 'fio', width: 30 },
        { header: 'График', key: 'scheduleType', width: 10 },
        { header: 'Отдел', key: 'department', width: 15 },
        { header: 'Норма дней', key: 'daysAssigned', width: 12 },
        { header: 'Факт дней', key: 'daysWorked', width: 12 },
        { header: '% выполнения', key: 'workPercent', width: 12 },
        { header: 'KPI сумм', key: 'kpiSum', width: 12 },
        { header: 'KPI итог', key: 'kpiFinal', width: 12 },
      ];

      results.forEach((r: any, idx: number) => {
        worksheet.addRow({
          idx: idx + 1,
          fio: r.fio,
          scheduleType: r.scheduleType,
          department: r.department,
          daysAssigned: r.daysAssigned,
          daysWorked: r.daysWorked,
          workPercent: r.workPercent,
          kpiSum: r.kpiSum,
          kpiFinal: r.kpiFinal,
        });
      });

      if (errors && errors.length > 0) {
        const errorSheet = workbook.addWorksheet('Errors');
        errorSheet.columns = [
          { header: '#', key: 'idx', width: 5 },
          { header: 'ФИО', key: 'fio', width: 30 },
          { header: 'Тип', key: 'type', width: 15 },
          { header: 'Описание', key: 'details', width: 50 },
        ];
        errors.forEach((e: any, idx: number) => {
          errorSheet.addRow({
            idx: idx + 1,
            fio: e.fio,
            type: e.type,
            details: e.details,
          });
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPIfinal_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка формирования файла' };
    }
  },

  async download1C(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('1C');

      results.forEach((r: any, idx: number) => {
        const kpiFinalRounded = Math.ceil(r.kpiFinal || 0);
        worksheet.addRow([idx + 1, r.fio, kpiFinalRounded]);
      });

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPI_for_1C_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка формирования файла для 1С' };
    }
  },

  async downloadBuh(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);
      const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
      const month = parseInt(getRequestField(ctx, 'month') || '0', 10);
      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Некорректные значения года или месяца');
      }

      const requestedDepartment = String(getRequestField(ctx, 'department') || '').trim();
      const holidays = await loadHolidayDates(ctx, year, month);
      const settings = await loadSettingsForDepartment(requestedDepartment);
      const overrideDate = resolveMeetingDateOverride(settings, year, month);
      const meetingDate = overrideDate || getLastWorkingDate(year, month, holidays);

      const monthNom = MONTHS_NOMINATIVE[month - 1] || '';
      const monthGen = MONTHS_GENITIVE[month - 1] || '';
      const lastDay = new Date(year, month, 0).getDate();
      const departmentTitle = requestedDepartment || settings.departmentTitle || '';

      const templateVars = {
        month: monthNom,
        monthGen,
        year: String(year),
        department: departmentTitle,
      };

      const agendaText = applyTemplate(settings.agendaText || '', templateVars);
      const footerText = applyTemplate(settings.footerText || '', templateVars);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Buh');

      const fontName = 'Times New Roman';
      const totalColumns = 5;
      const columnWidths = [5, 45, 12, 8, 12];
      worksheet.columns = columnWidths.map((width) => ({ width }));
      worksheet.properties.defaultRowHeight = 18;

      const mergeAcross = (row: number, start = 1, end = totalColumns) => {
        worksheet.mergeCells(row, start, row, end);
      };

      const setMergedText = (
        row: number,
        start: number,
        end: number,
        text: string,
        opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' }
      ) => {
        mergeAcross(row, start, end);
        const cell = worksheet.getCell(row, start);
        cell.value = text;
        cell.font = {
          name: fontName,
          size: opts?.size || 11,
          bold: Boolean(opts?.bold),
        };
        cell.alignment = {
          horizontal: opts?.align || 'left',
          vertical: 'middle',
          wrapText: true,
        };
        return cell;
      };

      const setCell = (
        row: number,
        col: number,
        value: string | number,
        opts?: { bold?: boolean; size?: number; align?: 'left' | 'center' }
      ) => {
        const cell = worksheet.getCell(row, col);
        cell.value = value;
        cell.font = {
          name: fontName,
          size: opts?.size || 11,
          bold: Boolean(opts?.bold),
        };
        cell.alignment = {
          horizontal: opts?.align || 'left',
          vertical: 'middle',
          wrapText: true,
        };
        return cell;
      };

      let row = 1;
      setMergedText(
        row,
        1,
        totalColumns,
        `Протокол № ${settings.protocolNumber || '1'}`,
        { bold: true, size: 12, align: 'center' }
      );
      row += 2;
      setMergedText(row, 1, totalColumns, settings.meetingTitle || '', {
        bold: true,
        size: 12,
      });
      row += 1;
      if (departmentTitle) {
        setMergedText(row, 1, totalColumns, departmentTitle, { bold: true, size: 12 });
        row += 1;
      }
      row += 1;
      setMergedText(
        row,
        1,
        totalColumns,
        `Дата заседания: ${formatDateRu(meetingDate)} г.`,
        {}
      );
      row += 1;
      setMergedText(row, 1, totalColumns, `Место проведения: ${settings.place || ''}`, {});
      row += 2;
      setMergedText(
        row,
        1,
        totalColumns,
        `Оцениваемый период: с 25 ${MONTHS_GENITIVE[((month - 2 + 12) % 12)]} ${month === 1 ? year - 1 : year} года - по 25 ${monthGen} ${year} г.`,
        {}
      );
      row += 2;

      setMergedText(row, 1, totalColumns, 'Члены комиссии:', { bold: true });
      row += 1;

      const members = (settings.commissionMembers || [])
        .slice()
        .sort((a: any, b: any) => {
          const ao = typeof a?.order === 'number' ? a.order : 9999;
          const bo = typeof b?.order === 'number' ? b.order : 9999;
          return ao - bo;
        });

      members.forEach((member: any) => {
        if (!member?.role || !member?.name) return;
        mergeAcross(row, 1, 3);
        mergeAcross(row, 4, totalColumns);
        setCell(row, 1, String(member.role));
        setCell(row, 4, String(member.name));
        row += 1;
      });

      if (settings.secretaryName) {
        mergeAcross(row, 1, 3);
        mergeAcross(row, 4, totalColumns);
        setCell(row, 1, 'Секретарь комиссии:', { bold: true });
        setCell(row, 4, String(settings.secretaryName));
        row += 2;
      } else {
        row += 1;
      }

      setMergedText(row, 1, totalColumns, 'ПОВЕСТКА ДНЯ:', { bold: true });
      row += 1;
      setMergedText(row, 1, totalColumns, agendaText || '', {});
      const agendaLines = String(agendaText || '').split('\n').length;
      worksheet.getRow(row).height = Math.max(18, agendaLines * 18);
      row += 2;

      const tableHeaderRow = row;
      const headers = ['№ п/п', 'ФИО', 'КПР план', 'КПР %', 'КПР итог'];

      headers.forEach((text, idx) => {
        const cell = setCell(tableHeaderRow, idx + 1, text, {
          bold: true,
          align: 'center',
        });
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      worksheet.getRow(tableHeaderRow).height = 22;
      row += 1;

      let totalKpiFinal = 0;
      results.forEach((r: any, idx: number) => {
        const kpiSum = Number(r.kpiSum || 0);
        const workPercent = Number(r.workPercent || 0);
        const kpiFinal = Number(r.kpiFinal || 0);
        totalKpiFinal += kpiFinal;

        setCell(row, 1, idx + 1, { align: 'center' });
        setCell(row, 2, r.fio || '');
        setCell(row, 3, kpiSum);
        setCell(row, 4, workPercent, { align: 'center' });
        setCell(row, 5, kpiFinal);

        row += 1;
      });

      const totalRow = row;
      setCell(totalRow, 2, 'Итого', { bold: true });
      setCell(totalRow, 5, totalKpiFinal, { bold: true });
      row += 2;

      const tableEndRow = totalRow;
      for (let r = tableHeaderRow; r <= tableEndRow; r += 1) {
        for (let c = 1; c <= totalColumns; c += 1) {
          const cell = worksheet.getCell(r, c);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          if (typeof cell.value === 'number') {
            cell.numFmt = '0';
          }
        }
      }

      if (footerText) {
        const footerLines = String(footerText).split('\n');
        footerLines.forEach((line) => {
          setMergedText(row, 1, totalColumns, line, {});
          row += 1;
        });
      }

      setMergedText(row, 1, totalColumns, 'Члены заседания проголосовали', {});
      row += 1;
      setMergedText(row, 1, totalColumns, 'ЗА – 5 человека', {});
      row += 1;
      setMergedText(row, 1, totalColumns, 'ПРОТИВ – нет', {});
      row += 1;
      setMergedText(row, 1, totalColumns, 'ВОЗДЕРЖАВШИХСЯ – нет', {});
      row += 1;

      setMergedText(row, 1, totalColumns, 'Члены комиссии:', {});
      row += 1;

      const coordinatorRole = settings.coordinatorRole || 'Координатор';
      const coordinator = members.find(
        (m: any) => String(m?.role || '').toLowerCase() === coordinatorRole.toLowerCase()
      );
      if (coordinator) {
        mergeAcross(row, 1, 3);
        mergeAcross(row, 4, totalColumns);
        setCell(row, 1, coordinatorRole);
        setCell(row, 4, String(coordinator.name));
        row += 1;
      }

      if (settings.secretaryName) {
        mergeAcross(row, 1, 3);
        mergeAcross(row, 4, totalColumns);
        setCell(row, 1, 'Секретарь комиссии');
        setCell(row, 4, String(settings.secretaryName));
      }

      const buffer = await workbook.xlsx.writeBuffer();

      ctx.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPI_for_Buh_${year}-${String(month).padStart(2, '0')}_${Date.now()}.xlsx"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = {
        error: error.message || 'Ошибка формирования файла для бухгалтерии',
      };
    }
  },

  async downloadBuhPdf(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);
      const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
      const month = parseInt(getRequestField(ctx, 'month') || '0', 10);
      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Некорректные значения года или месяца');
      }

      const requestedDepartment = String(getRequestField(ctx, 'department') || '').trim();
      const holidays = await loadHolidayDates(ctx, year, month);
      const settings = await loadSettingsForDepartment(requestedDepartment);
      const overrideDate = resolveMeetingDateOverride(settings, year, month);
      const meetingDate = overrideDate || getLastWorkingDate(year, month, holidays);

      const buffer = await buildBuhPdf({
        results: results || [],
        year,
        month,
        department: requestedDepartment,
        meetingDate,
        settings,
      });

      ctx.set('Content-Type', 'application/pdf');
      ctx.set(
        'Content-Disposition',
        `attachment; filename="KPI_for_Buh_${year}-${String(month).padStart(2, '0')}_${Date.now()}.pdf"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = {
        error: error.message || 'Ошибка формирования PDF для бухгалтерии',
      };
    }
  },

  async downloadReport(ctx: Context) {
    try {
      const { results } = await calcCore(ctx);
      const year = parseInt(getRequestField(ctx, 'year') || '0', 10);
      const month = parseInt(getRequestField(ctx, 'month') || '0', 10);
      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Некорректные значения года или месяца');
      }

      const requestedDepartment = String(getRequestField(ctx, 'department') || '').trim();
      const holidays = await loadHolidayDates(ctx, year, month);
      const settings = await loadSettingsForDepartment(requestedDepartment);
      const overrideDate = resolveMeetingDateOverride(settings, year, month);
      const meetingDate = overrideDate || getLastWorkingDate(year, month, holidays);

      const buffer = await buildReportPdf({
        results: results || [],
        year,
        month,
        department: requestedDepartment,
        meetingDate,
        settings,
      });

      ctx.set('Content-Type', 'application/pdf');
      ctx.set(
        'Content-Disposition',
        `attachment; filename="Protocol_${year}_${String(month).padStart(2, '0')}.pdf"`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка формирования отчёта' };
    }
  },

  /**
   * Recalculate KPI from edited parsedDetails (no Excel file).
   * Body: { parsedDetails, year, month, department, nchDay, ndShift }
   * Re-aggregates letters_x / numbers_x from dayValues, then runs calculateKPI.
   */
  async recalculate(ctx: Context) {
    try {
      const body: any = (ctx.request as any).body || {};
      const parsedDetails: any[] = Array.isArray(body?.parsedDetails) ? body.parsedDetails : [];
      const year = parseInt(String(body?.year || '0'), 10);
      const month = parseInt(String(body?.month || '0'), 10);
      const department = String(body?.department || '').trim();
      const nchDay = parseInt(String(body?.nchDay || '0'), 10) || 0;
      const ndShift = parseInt(String(body?.ndShift || '0'), 10) || 0;

      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Некорректные значения года или месяца');
      }
      if (nchDay <= 0 && ndShift <= 0) {
        throw new Error('Нужно указать Н.ч для дневных и/или Н.д для суточных');
      }
      if (parsedDetails.length === 0) {
        throw new Error('Нет данных для пересчёта');
      }

      const access = await getUserAccess(ctx);
      const allowedDepartments = access.allowedDepartments || [];
      const normalizedAllowed = allowedDepartments.map(normalizeDepartment).filter(Boolean);
      if (!access.isAdmin) {
        if (normalizedAllowed.length === 0) ctx.throw(403, 'Нет доступных отделов');
        if (!department) ctx.throw(400, 'Отдел для расчёта не указан');
        const requestedNorm = normalizeDepartment(department);
        if (!normalizedAllowed.includes(requestedNorm)) {
          ctx.throw(403, 'Нет доступа к указанному отделу');
        }
      }

      const employees = parsedDetails.map((p: any) => {
        const agg = aggregateDayValues(p?.dayValues || []);
        return {
          fio: String(p?.fio || '').trim(),
          department: p?.department || '',
          ...agg,
          dayValues: p?.dayValues || [],
        };
      });

      const kpiFilters: any = {};
      if (!access.isAdmin && allowedDepartments.length > 0) {
        kpiFilters.department = { $in: allowedDepartments };
      }
      const kpiQuery: any = {
        fields: ['id', 'fio', 'kpiSum', 'scheduleType', 'department', 'categoryCode'],
        publicationState: 'live',
        pagination: { pageSize: 10000 },
      };
      if (Object.keys(kpiFilters).length > 0) {
        kpiQuery.filters = kpiFilters;
      }
      const kpiTable = await strapi.entityService.findMany('api::employee.employee', kpiQuery);

      let finalKpi = kpiTable;
      if (department) {
        const target = normalizeDepartment(department);
        finalKpi = (kpiTable || []).filter(
          (item: any) => normalizeDepartment(item?.department) === target
        );
      }

      const { results, errors } = kpiCalculator.calculateKPI(
        employees as any,
        finalKpi as any,
        nchDay,
        ndShift
      );

      const refreshedDetails = employees.map((e: any) => ({
        fio: e.fio,
        department: e.department,
        letters_weekday: e.letters_weekday,
        letters_sat: e.letters_sat,
        letters_sun: e.letters_sun,
        letters_holiday: e.letters_holiday,
        numbers_weekday: e.numbers_weekday,
        numbers_sat: e.numbers_sat,
        numbers_sun: e.numbers_sun,
        numbers_holiday: e.numbers_holiday,
        dayValues: e.dayValues,
      }));

      ctx.body = { results, errors, parsedDetails: refreshedDetails };
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка пересчёта KPI' };
    }
  },

  /**
   * Generate PDF from pre-calculated results (e.g. restored from archive).
   * Accepts JSON body with { results, year, month, department, nchDay, ndShift }.
   * No timesheet files needed.
   */
  async generatePdfFromResults(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const results = body?.results || [];
      const year = parseInt(body?.year || '0', 10);
      const month = parseInt(body?.month || '0', 10);
      const department = String(body?.department || '').trim();

      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Некорректные значения года или месяца');
      }
      if (!results || results.length === 0) {
        throw new Error('Нет результатов для генерации PDF');
      }

      const holidays = await loadHolidayDates(ctx, year, month);
      const settings = await loadSettingsForDepartment(department);
      const overrideDate = resolveMeetingDateOverride(settings, year, month);
      const meetingDate = overrideDate || getLastWorkingDate(year, month, holidays);

      const buffer = await buildBuhPdf({
        results,
        year,
        month,
        department,
        meetingDate,
        settings,
      });

      const asciiDept = department.replace(/[^\x20-\x7E]/g, '_');
      const asciiName = `KPI_Protocol_${asciiDept}_${year}-${String(month).padStart(2, '0')}.pdf`;
      const utf8Name = encodeURIComponent(
        `KPI_Protocol_${department}_${year}-${String(month).padStart(2, '0')}.pdf`
      );
      ctx.set('Content-Type', 'application/pdf');
      ctx.set(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
      );
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 400;
      ctx.body = { error: error.message || 'Ошибка формирования PDF' };
    }
  },
};

