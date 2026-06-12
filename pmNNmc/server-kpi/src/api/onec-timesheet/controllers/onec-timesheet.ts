import type { Context } from 'koa';
import ExcelJS from 'exceljs';
import { getUserAccess } from '../../../utils/access';

const BRIDGE_TIMEOUT_MS = 120_000;

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

function requestedRefresh(ctx: Context): boolean {
  return ['1', 'true', 'yes'].includes(
    String((ctx.query as any)?.refresh || '').trim().toLowerCase()
  );
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

function bridgeConfig() {
  const baseUrl = String(process.env.ONEC_BRIDGE_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.ONEC_BRIDGE_TOKEN || '').trim();
  if (!baseUrl || !token) {
    const error: any = new Error('Интеграция с 1С не настроена');
    error.status = 503;
    throw error;
  }
  return { baseUrl, token };
}

async function bridgeGet(path: string): Promise<any> {
  const { baseUrl, token } = bridgeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: {
        'X-Bridge-Token': token,
        Accept: 'application/json',
      },
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error: any = new Error(payload?.error || `Ошибка моста 1С: HTTP ${response.status}`);
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
      row[`day${day}`] = employee?.days?.[String(day)] ?? '';
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
      if (requestedRefresh(ctx)) params.set('refresh', '1');

      const payload = await bridgeGet(`/timesheets?${params.toString()}`);
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

      ctx.body = { items, cache: payload?.cache || null };
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось получить табели из 1С' };
    }
  },

  async download(ctx: Context) {
    try {
      const access = await getUserAccess(ctx);
      const id = encodeURIComponent(String(ctx.params.id || ''));
      if (!id) ctx.throw(400, 'Не указан табель 1С');

      const refreshQuery = requestedRefresh(ctx) ? '?refresh=1' : '';
      const payload = await bridgeGet(`/timesheets/${id}${refreshQuery}`);
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
