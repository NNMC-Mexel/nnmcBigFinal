import { createHash } from 'crypto';

const CARD_UID = 'api::employee-card.employee-card' as any;
const LOG_UID = 'api::employee-sync-log.employee-sync-log' as any;

type SyncTrigger = 'manual' | 'scheduled';

interface SyncOptions {
  trigger: SyncTrigger;
  user?: any;
}

interface OneCPage {
  meta?: Record<string, any>;
  items?: any[];
  issues?: any[];
}

let activeSync: Promise<any> | null = null;

function cleanString(value: any): string {
  return String(value ?? '').trim();
}

function cleanNullableDate(value: any): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function cleanNullableDateTime(value: any): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function cleanNumber(value: any): number {
  const number = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function normalizeWorkplace(value: any) {
  return {
    employeeId: cleanString(value?.employeeId),
    personnelNumber: cleanString(value?.personnelNumber),
    primary: value?.primary === true,
    organizationId: cleanString(value?.organizationId),
    organization: cleanString(value?.organization),
    departmentId: cleanString(value?.departmentId),
    department: cleanString(value?.department),
    positionId: cleanString(value?.positionId),
    position: cleanString(value?.position),
    employmentType: cleanString(value?.employmentType),
    rate: cleanNumber(value?.rate),
    salary: cleanNumber(value?.salary),
    payroll: cleanNumber(value?.payroll),
    schedule: cleanString(value?.schedule),
    hireDate: cleanNullableDate(value?.hireDate),
    dismissalDate: cleanNullableDate(value?.dismissalDate),
  };
}

function normalizeCard(value: any, sourceActualAt: string | null) {
  const iin = cleanString(value?.iin);
  const workplaces = Array.isArray(value?.workplaces)
    ? value.workplaces.map(normalizeWorkplace)
    : [];

  const data = {
    iin,
    physicalPersonId: cleanString(value?.physicalPersonId),
    fio: cleanString(value?.fio),
    lastName: cleanString(value?.lastName),
    firstName: cleanString(value?.firstName),
    middleName: cleanString(value?.middleName),
    birthDate: cleanNullableDate(value?.birthDate),
    gender: cleanString(value?.gender),
    nationality: cleanString(value?.nationality),
    active: value?.active !== false,
    workplaces,
    sourceActualAt,
  };

  const { sourceActualAt: _sourceActualAt, ...hashData } = data;
  const sourceHash = createHash('sha256')
    .update(JSON.stringify(hashData))
    .digest('hex');

  return { ...data, sourceHash };
}

function oneCConfig() {
  const baseUrl = cleanString(process.env.ONEC_API_URL).replace(/\/+$/, '');
  const username = cleanString(process.env.ONEC_API_USER);
  const password = String(process.env.ONEC_API_PASSWORD || '');
  const pageSize = Math.max(
    10,
    Math.min(Number.parseInt(process.env.ONEC_EMPLOYEE_PAGE_SIZE || '200', 10) || 200, 500)
  );
  const timeoutMs = Math.max(
    5000,
    Math.min(Number.parseInt(process.env.ONEC_API_TIMEOUT_MS || '120000', 10) || 120000, 300000)
  );

  if (!baseUrl || !username || !password) {
    throw new Error('1C REST API is not configured: ONEC_API_URL, ONEC_API_USER and ONEC_API_PASSWORD are required');
  }

  return { baseUrl, username, password, pageSize, timeoutMs };
}

function shouldDeactivateMissingCards(): boolean {
  return String(process.env.EMPLOYEE_SYNC_DEACTIVATE_MISSING || 'false').toLowerCase() === 'true';
}

async function fetchOneCPage(page: number): Promise<OneCPage> {
  const config = oneCConfig();
  const url = new URL(`${config.baseUrl}/v1/employee-cards`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(config.pageSize));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const authorization = Buffer.from(
    `${config.username}:${config.password}`,
    'utf8'
  ).toString('base64');

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${authorization}`,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      const message = body?.error?.message || body?.message || text || `HTTP ${response.status}`;
      throw new Error(`1C REST API returned HTTP ${response.status}: ${message}`);
    }

    return body as OneCPage;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`1C REST API request timed out after ${config.timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function createSyncLog(strapi: any, options: SyncOptions, startedAt: string) {
  return await strapi.db.query(LOG_UID).create({
    data: {
      status: 'running',
      trigger: options.trigger,
      triggeredBy: options.user?.id || null,
      triggeredByName:
        cleanString(`${options.user?.firstName || ''} ${options.user?.lastName || ''}`) ||
        cleanString(options.user?.username) ||
        (options.trigger === 'scheduled' ? 'system' : ''),
      startedAt,
      stats: {},
      issues: [],
    },
  });
}

async function updateSyncLog(strapi: any, id: number, data: Record<string, any>) {
  return await strapi.db.query(LOG_UID).update({
    where: { id },
    data,
  });
}

async function performSync(strapi: any, options: SyncOptions) {
  const startedAt = new Date().toISOString();
  const log = await createSyncLog(strapi, options, startedAt);
  const issues: any[] = [];

  try {
    const allItems: any[] = [];
    let page = 1;
    let totalPages = 1;
    let expectedTotal: number | null = null;
    let sourceActualAt: string | null = null;
    let source = '';

    do {
      const response = await fetchOneCPage(page);
      const items = Array.isArray(response.items) ? response.items : [];
      allItems.push(...items);
      if (Array.isArray(response.issues)) issues.push(...response.issues);

      const meta = response.meta || {};
      totalPages = Math.max(1, Number(meta.totalPages || 1));
      if (expectedTotal === null && Number.isFinite(Number(meta.total))) {
        expectedTotal = Number(meta.total);
      }
      sourceActualAt = cleanNullableDateTime(meta.actualAt) || sourceActualAt;
      source = cleanString(meta.source) || source;
      page += 1;
    } while (page <= totalPages);

    if (allItems.length === 0) {
      throw new Error('1C returned an empty employee list; synchronization stopped to protect existing cards');
    }
    if (expectedTotal !== null && expectedTotal > allItems.length) {
      throw new Error(
        `1C returned an incomplete employee list: expected ${expectedTotal}, received ${allItems.length}`
      );
    }

    const now = new Date().toISOString();
    const existingCards = await strapi.db.query(CARD_UID).findMany({
      select: ['id', 'iin', 'sourceHash', 'active'],
    });
    const existingByIin = new Map<string, any>(
      existingCards.map((card: any) => [cleanString(card.iin), card])
    );
    const seenIins = new Set<string>();
    const stats = {
      received: allItems.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      deactivated: 0,
      skipped: 0,
      workplaceCount: 0,
    };

    for (const sourceItem of allItems) {
      const card = normalizeCard(sourceItem, sourceActualAt);
      if (!/^\d{12}$/.test(card.iin) || !card.fio) {
        stats.skipped += 1;
        issues.push({
          code: 'invalid_employee_card',
          iin: card.iin,
          fio: card.fio,
          message: 'Employee card has no valid 12-digit IIN or FIO',
        });
        continue;
      }

      seenIins.add(card.iin);
      stats.workplaceCount += card.workplaces.length;
      const existing = existingByIin.get(card.iin);

      if (!existing) {
        await strapi.db.query(CARD_UID).create({
          data: {
            ...card,
            lastSyncedAt: now,
            deactivatedAt: null,
            keycloakStatus: 'not_created',
          },
        });
        stats.created += 1;
        continue;
      }

      if (existing.sourceHash === card.sourceHash && existing.active === card.active) {
        stats.unchanged += 1;
        continue;
      }

      await strapi.db.query(CARD_UID).update({
        where: { id: existing.id },
        data: {
          ...card,
          lastSyncedAt: now,
          deactivatedAt: card.active ? null : now,
        },
      });
      stats.updated += 1;
    }

    if (shouldDeactivateMissingCards()) {
      for (const existing of existingCards) {
        const iin = cleanString(existing.iin);
        if (!iin || seenIins.has(iin) || existing.active === false) continue;
        await strapi.db.query(CARD_UID).update({
          where: { id: existing.id },
          data: {
            active: false,
            deactivatedAt: now,
            lastSyncedAt: now,
          },
        });
        stats.deactivated += 1;
      }
    }

    await updateSyncLog(strapi, log.id, {
      status: 'completed',
      finishedAt: new Date().toISOString(),
      sourceActualAt,
      source,
      stats,
      issues,
      message: issues.length > 0
        ? `Synchronization completed with ${issues.length} issue(s)`
        : 'Synchronization completed',
    });

    return {
      success: true,
      source,
      sourceActualAt,
      stats,
      issues,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    await updateSyncLog(strapi, log.id, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      issues,
      message,
    }).catch(() => {});
    throw error;
  }
}

export async function syncEmployeeCards(strapi: any, options: SyncOptions) {
  if (activeSync) {
    const error: any = new Error('Employee synchronization is already running');
    error.status = 409;
    throw error;
  }

  activeSync = performSync(strapi, options);
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

export function isEmployeeSyncRunning(): boolean {
  return activeSync !== null;
}

export function startEmployeeSyncScheduler(strapi: any) {
  const enabled = String(process.env.EMPLOYEE_SYNC_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    strapi.log.info('[employee-sync] Scheduled synchronization is disabled');
    return;
  }

  const hourUtc = Math.max(
    0,
    Math.min(Number.parseInt(process.env.EMPLOYEE_SYNC_HOUR_UTC || '2', 10) || 2, 23)
  );
  const globalState = global as any;
  if (globalState.__nnmcEmployeeSyncTimer) {
    clearTimeout(globalState.__nnmcEmployeeSyncTimer);
  }

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hourUtc, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    strapi.log.info(`[employee-sync] Next scheduled synchronization: ${next.toISOString()}`);
    globalState.__nnmcEmployeeSyncTimer = setTimeout(async () => {
      try {
        await syncEmployeeCards(strapi, { trigger: 'scheduled' });
        strapi.log.info('[employee-sync] Scheduled synchronization completed');
      } catch (error: any) {
        strapi.log.error(`[employee-sync] Scheduled synchronization failed: ${error?.message || error}`);
      } finally {
        scheduleNext();
      }
    }, delay);
    globalState.__nnmcEmployeeSyncTimer.unref?.();
  };

  scheduleNext();
}
