import type { Context } from 'koa';
import { getUserAccess } from '../../../utils/access';

function normalizeDepartment(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[\s\-_]+/g, '')
    .replace(/^OCMK/, 'ОЦМК');
}

function departmentsMatch(left: any, right: any): boolean {
  const a = normalizeDepartment(left);
  const b = normalizeDepartment(right);
  return Boolean(a && b && a === b);
}

function parseInteger(value: any, min: number, max: number): number | null {
  const parsed = parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function oneCConfig() {
  const baseUrl = String(process.env.ONEC_API_URL || '').trim().replace(/\/+$/, '');
  const username = String(process.env.ONEC_API_USER || '').trim();
  const password = String(process.env.ONEC_API_PASSWORD || '');
  const timeoutMs = Math.max(
    1000,
    Math.min(parseInt(process.env.ONEC_API_TIMEOUT_MS || '30000', 10), 120000)
  );

  if (!baseUrl || !username || !password) {
    const error: any = new Error('Прямой REST API 1С не настроен');
    error.status = 503;
    throw error;
  }
  return { baseUrl, username, password, timeoutMs };
}

function validateDepartmentAccess(ctx: Context, access: any, department: string) {
  if (!department) ctx.throw(400, 'Укажите подразделение');
  if (access.isAdmin) return;

  const allowed = Array.isArray(access.allowedDepartments) ? access.allowedDepartments : [];
  if (!allowed.some((item: string) => departmentsMatch(item, department))) {
    ctx.throw(403, 'Нет доступа к сотрудникам указанного подразделения');
  }
}

async function fetchOneCEmployees(params: URLSearchParams): Promise<any> {
  const { baseUrl, username, password, timeoutMs } = oneCConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const authorization = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  try {
    const response = await fetch(`${baseUrl}/v1/employees?${params.toString()}`, {
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
      const timeoutError: any = new Error('Превышено время ожидания ответа REST API 1С');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async list(ctx: Context) {
    try {
      const access = await getUserAccess(ctx);
      const department = String((ctx.query as any)?.department || '').trim();
      validateDepartmentAccess(ctx, access, department);

      const now = new Date();
      const year = parseInteger((ctx.query as any)?.year, 2000, 2100) || now.getFullYear();
      const month = parseInteger((ctx.query as any)?.month, 1, 12) || now.getMonth() + 1;
      const limit = parseInteger((ctx.query as any)?.limit, 1, 5000) || 1000;
      const params = new URLSearchParams({
        department,
        year: String(year),
        month: String(month),
        limit: String(limit),
      });

      const payload = await fetchOneCEmployees(params);
      const items = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item: any) => departmentsMatch(item?.department, department))
        .map((item: any) => ({
          id: String(item?.id || ''),
          fio: String(item?.fio || '').trim(),
          departmentId: String(item?.departmentId || ''),
          department: String(item?.department || '').trim(),
          positionId: String(item?.positionId || ''),
          position: String(item?.position || '').trim(),
          categoryId: String(item?.categoryId || ''),
          category: String(item?.category || '').trim(),
          organization: String(item?.organization || '').trim(),
          active: item?.active !== false,
        }))
        .filter((item: any) => item.id && item.fio);

      ctx.body = {
        items,
        meta: {
          year,
          month,
          department,
          count: items.length,
          source: 'onec-rest',
        },
      };
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось получить сотрудников из 1С' };
    }
  },
};
