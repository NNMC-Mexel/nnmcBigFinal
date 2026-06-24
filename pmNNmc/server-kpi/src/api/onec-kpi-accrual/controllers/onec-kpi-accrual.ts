import type { Context } from 'koa';
import { createHash } from 'crypto';
import {
  canSendKpiToOneC,
  getUserAccess,
  refreshCurrentUserAccessFromPm,
} from '../../../utils/access';

function normalizeDepartment(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[\s\-_]+/g, '')
    .replace(/^OCMK/, 'ОЦМК');
}

function oneCConfig() {
  const baseUrl = String(process.env.ONEC_API_URL || '').trim().replace(/\/+$/, '');
  const username = String(process.env.ONEC_API_USER || '').trim();
  const password = String(process.env.ONEC_API_PASSWORD || '');
  const organization = String(
    process.env.ONEC_KPI_ORGANIZATION || 'АО Национальный научный медицинский центр'
  ).trim();
  const accrual = String(process.env.ONEC_KPI_ACCRUAL_NAME || 'KPI').trim();
  const timeoutMs = Math.max(
    1000,
    Math.min(parseInt(process.env.ONEC_KPI_TIMEOUT_MS || '120000', 10), 300000)
  );

  if (!baseUrl || !username || !password) {
    const error: any = new Error('Прямой REST API 1С не настроен');
    error.status = 503;
    throw error;
  }
  return { baseUrl, username, password, organization, accrual, timeoutMs };
}

async function oneCPost(path: string, body: any): Promise<any> {
  const { baseUrl, username, password, timeoutMs } = oneCConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const authorization = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${authorization}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
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
      const timeoutError: any = new Error('Превышено время ожидания создания документа в 1С');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async create(ctx: Context) {
    try {
      await refreshCurrentUserAccessFromPm(ctx);
      const access = await getUserAccess(ctx);
      if (!canSendKpiToOneC(access)) {
        ctx.throw(403, 'Отправлять итоговый KPI в 1С могут только супер-администраторы и сотрудники бухгалтерии');
      }

      const body: any = (ctx.request as any).body || {};
      const year = parseInt(String(body.year || ''), 10);
      const month = parseInt(String(body.month || ''), 10);
      const department = String(body.department || '').trim();
      const rawResults = Array.isArray(body.results) ? body.results : [];

      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        ctx.throw(400, 'Некорректный год');
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        ctx.throw(400, 'Некорректный месяц');
      }
      if (!department) {
        ctx.throw(400, 'Не указано подразделение');
      }
      const employees = rawResults
        .map((item: any) => ({
          fio: String(item?.fio || '').trim(),
          amount: Math.ceil(Number(item?.kpiFinal ?? item?.amount ?? 0)),
        }))
        .filter((item: any) => item.fio && Number.isFinite(item.amount) && item.amount > 0);

      if (employees.length === 0) {
        ctx.throw(400, 'Нет положительных сумм KPI для отправки');
      }
      if (employees.length > 2000) {
        ctx.throw(400, 'Слишком много сотрудников в одном документе');
      }

      const { organization, accrual } = oneCConfig();
      const currentUser = (ctx.state as any)?.user;
      const submittedBy = String(currentUser?.username || currentUser?.email || 'unknown');
      const departmentHash = createHash('sha256')
        .update(normalizeDepartment(department), 'utf8')
        .digest('hex')
        .slice(0, 16);
      const idempotencyKey = `pm-kpi:${year}-${String(month).padStart(2, '0')}:${departmentHash}`;

      const payload = await oneCPost('/v1/kpi-accruals', {
        year,
        month,
        organization,
        department,
        accrual,
        idempotencyKey,
        submittedBy,
        employees,
      });

      ctx.status = 201;
      ctx.body = payload;
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось создать документ KPI в 1С' };
    }
  },
};
