import type { Context } from 'koa';
import { createHash } from 'crypto';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { requireCorporateKpiOneCAccess } from '../../../utils/access';

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

function oneCErrorMessage(payload: any, text: string, status: number): string {
  const candidates = [
    payload?.error?.message,
    payload?.error?.description,
    payload?.['#exception']?.exception?.descr,
    payload?.['#exception']?.exception?.description,
    payload?.message,
    payload?.description,
    typeof payload?.error === 'string' ? payload.error : '',
  ];
  const structured = candidates.find((value) => typeof value === 'string' && value.trim());
  if (structured) return String(structured).trim();

  const plainText = String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plainText) return plainText.slice(0, 1000);

  return `REST API 1С: HTTP ${status}`;
}

function requestOneC(
  url: URL,
  authorization: string,
  body: Buffer,
  timeoutMs: number
): Promise<{ status: number; text: string }> {
  const sendRequest = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = sendRequest(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authorization}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': String(body.byteLength),
          Connection: 'close',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode || 502,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      const timeoutError: any = new Error('Превышено время ожидания ответа 1С');
      timeoutError.code = 'ONEC_TIMEOUT';
      request.destroy(timeoutError);
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function oneCPost(path: string, body: any): Promise<any> {
  const { baseUrl, username, password, timeoutMs } = oneCConfig();
  const authorization = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  const requestBody = Buffer.from(JSON.stringify(body), 'utf8');

  try {
    const response = await requestOneC(
      new URL(`${baseUrl}${path}`),
      authorization,
      requestBody,
      timeoutMs
    );
    const text = response.text;
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (response.status < 200 || response.status >= 300) {
      const error: any = new Error(oneCErrorMessage(payload, text, response.status));
      error.status = response.status >= 500 ? 502 : response.status;
      throw error;
    }
    if (!payload) {
      const error: any = new Error('1С вернула некорректный JSON');
      error.status = 502;
      throw error;
    }
    return payload;
  } catch (error: any) {
    if (error?.code === 'ONEC_TIMEOUT') {
      const timeoutError: any = new Error('Превышено время ожидания ответа 1С');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  }
}

function requestError(status: number, message: string): never {
  const error: any = new Error(message);
  error.status = status;
  throw error;
}

function parseKpiRequest(body: any) {
  const year = parseInt(String(body?.year || ''), 10);
  const month = parseInt(String(body?.month || ''), 10);
  const department = String(body?.department || '').trim();
  const rawResults = Array.isArray(body?.results) ? body.results : [];

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    requestError(400, 'Некорректный год');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    requestError(400, 'Некорректный месяц');
  }
  if (!department) {
    requestError(400, 'Не указано подразделение');
  }

  const employees = rawResults
    .map((item: any) => ({
      fio: String(item?.fio || '').trim(),
      amount: Math.round(Number(item?.kpiFinal ?? item?.amount ?? 0)),
    }))
    .filter((item: any) => item.fio && Number.isFinite(item.amount) && item.amount > 0);

  if (employees.length === 0) {
    requestError(400, 'Нет положительных сумм KPI для отправки');
  }
  if (employees.length > 2000) {
    requestError(400, 'Слишком много сотрудников в одном документе');
  }

  return { year, month, department, employees };
}

function validationErrorMessage(payload: any): string {
  const rejected = (Array.isArray(payload?.items) ? payload.items : [])
    .filter((item: any) => item?.matched !== true);
  if (rejected.length === 0) {
    return 'Сверка сотрудников с 1С не пройдена';
  }
  const details = rejected
    .slice(0, 10)
    .map((item: any) => `${String(item?.fio || 'Без ФИО')}: ${String(item?.message || item?.status || 'не сопоставлен')}`)
    .join('; ');
  const suffix = rejected.length > 10 ? `; ещё ${rejected.length - 10}` : '';
  return `Сверка сотрудников с 1С не пройдена. ${details}${suffix}`;
}

export default {
  async validate(ctx: Context) {
    try {
      await requireCorporateKpiOneCAccess(ctx);
      const { year, month, department, employees } = parseKpiRequest((ctx.request as any).body || {});
      const { organization, accrual } = oneCConfig();

      ctx.body = await oneCPost('/v1/kpi-accruals', {
        validateOnly: true,
        year,
        month,
        organization,
        department,
        accrual,
        employees,
      });
    } catch (error: any) {
      ctx.status = error?.status || 500;
      ctx.body = { error: error?.message || 'Не удалось сверить сотрудников с 1С' };
    }
  },

  async create(ctx: Context) {
    try {
      await requireCorporateKpiOneCAccess(ctx);

      const body: any = (ctx.request as any).body || {};
      const { year, month, department, employees } = parseKpiRequest(body);

      const { organization, accrual } = oneCConfig();
      const validation = await oneCPost('/v1/kpi-accruals', {
        validateOnly: true,
        year,
        month,
        organization,
        department,
        accrual,
        employees,
      });
      if (Number(validation?.matchedCount || 0) <= 0) {
        requestError(400, validationErrorMessage(validation));
      }

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
