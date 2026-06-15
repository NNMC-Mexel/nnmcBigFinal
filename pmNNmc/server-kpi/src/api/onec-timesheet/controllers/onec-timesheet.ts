import type { Context } from 'koa';
import ExcelJS from 'exceljs';
import { getUserAccess } from '../../../utils/access';

function normalizeDepartment(value: any): string {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[\s\-_]+/g, '');

  return compact.replace(/^OCMK/, 'ОЦМК');
}

function departmentsMatch(left: any, right: any): boolean {
  const a = normalizeDepartment(left);
  const b = normalizeDepartment(right);
  return Boolean(a && b && a === b);
}

function requestedDepartment(ctx: Context): string {
  return String((ctx.query as any)?.department || '').trim();
}

function validateDepartmentAccess(ctx: Context, access: any, department: string) {
  if (!department) {
    ctx.throw(400, 'Укажите подразделение для загрузки табеля из 1С');
  }
  if (access.isAdmin) return;

  const allowed = Array.isArray(access.allowedDepartments) ? access.allowedDepartments : [];
  if (!allowed.some((item: string) => departmentsMatch(item, department))) {
    ctx.throw(403, 'Нет доступа к табелям указанного подразделения');
  }
}

function validateActualDepartmentAccess(ctx: Context, access: any, department: string) {
  if (access.isAdmin) return;
  const allowed = Array.isArray(access.allowedDepartments) ? access.allowedDepartments : [];
  if (!allowed.some((item: string) => departmentsMatch(item, department))) {
    ctx.throw(403, 'Нет доступа к выбранному табелю 1С');
  }
}

function oneCConfig() {
  const baseUrl = String(process.env.ONEC_API_URL || '').trim().replace(/\/+$/, '');
  const username = String(process.env.ONEC_API_USER || '').trim();
  const password = String(process.env.ONEC_API_PASSWORD || '');
  const timeoutMs = Math.max(
    1000,
    Math.min(parseInt(process.env.ONEC_API_TIMESHEET_TIMEOUT_MS || '120000', 10), 300000)
  );
  if (!baseUrl || !username || !password) {
    const error: any = new Error('Прямой REST API 1С не настроен');
    error.status = 503;
    throw error;
  }
  return { baseUrl, username, password, timeoutMs };
}

async function oneCGet(path: string): Promise<any> {
  const { baseUrl, username, password, timeoutMs } = oneCConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const authorization = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${authorization}`,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      const error: any = new Error('1С вернула некорректный JSON');
      error.status = 502;
      throw error;
    }
    if (!response.ok) {
      const error: any = new Error(
        payload?.error?.message || payload?.error || `REST API 1С: HTTP ${response.status}`
      );
      error.status = response.status >= 500 ? 502 : response.status;
      throw error;
    }
    return payload;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const timeoutError: any = new Error('Превышено время ожидания ответа от 1С');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveInt(value: any): number {
  const parsed = parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function buildTimesheetWorkbook(payload: any): Promise<Buffer> {
  const timesheet = payload?.timesheet || {};
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];
  if (employees.length === 0) {
    const error: any = new Error('В выбранном табеле 1С нет строк сотрудников');
    error.status = 404;
    throw error;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Табель');
  worksheet.columns = [
    { header: 'Сотрудник', key: 'fio', width: 42 },
    { header: 'Подразделение', key: 'department', width: 30 },
    { header: 'Должность', key: 'position', width: 24 },
    { header: 'Категория', key: 'category', width: 16 },
    ...Array.from({ length: 31 }, (_, index) => ({
      header: String(index + 1).padStart(2, '0'),
      key: `day${index + 1}`,
      width: 8,
    })),
  ];

  for (const employee of employees) {
    const row: Record<string, any> = {
      fio: String(employee?.fio || '').trim(),
      department: String(timesheet?.department || '').trim(),
      position: String(employee?.position || '').trim(),
      category: String(employee?.category || '').trim(),
    };
    for (let day = 1; day <= 31; day++) {
      row[`day${day}`] = Array.isArray(employee?.days)
        ? employee.days[day - 1] ?? ''
        : employee?.days?.[String(day)] ?? '';
    }
    if (row.fio) worksheet.addRow(row);
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  worksheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export default {
  async list(ctx: Context) {
    try {
      const access = await getUserAccess(ctx);
      const department = requestedDepartment(ctx);
      validateDepartmentAccess(ctx, access, department);

      const year = parsePositiveInt((ctx.query as any)?.year);
      const month = parsePositiveInt((ctx.query as any)?.month);
      const params = new URLSearchParams();
      if (year) params.set('year', String(year));
      if (month >= 1 && month <= 12) params.set('month', String(month));
      params.set('department', department);
      params.set('limit', '500');
      const payload = await oneCGet(`/v1/timesheets?${params.toString()}`);
      const items = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item: any) => item?.conducted === true && departmentsMatch(item?.department, department))
        .map((item: any) => ({
          id: item.id,
          date: item.date,
          number: item.number,
          period: item.period,
          organization: item.organization,
          department: item.department,
          dateFrom: item.dateFrom,
          dateTo: item.dateTo,
          conducted: true,
        }));

      ctx.body = {
        items,
        cache: {
          hit: false,
          source: 'onec-rest',
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось получить табели из 1С' };
    }
  },

  async download(ctx: Context) {
    try {
      const access = await getUserAccess(ctx);
      const id = String(ctx.params.id || '').trim();
      if (!id) ctx.throw(400, 'Не указан табель 1С');

      const params = new URLSearchParams({ id });
      const payload = await oneCGet(`/v1/timesheet?${params.toString()}`);
      const actualDepartment = String(payload?.timesheet?.department || '').trim();
      validateActualDepartmentAccess(ctx, access, actualDepartment);

      const requested = requestedDepartment(ctx);
      if (requested && !departmentsMatch(requested, actualDepartment)) {
        ctx.throw(409, 'Выбранный табель относится к другому подразделению');
      }

      const buffer = await buildTimesheetWorkbook(payload);
      const fileName = `1C_timesheet_${Date.now()}.xlsx`;

      ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buffer;
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось загрузить табель из 1С' };
    }
  },
};
