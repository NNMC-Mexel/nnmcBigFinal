import { createHash } from 'crypto';

const CARD_UID = 'api::employee-card.employee-card' as any;
const LOG_UID = 'api::employee-sync-log.employee-sync-log' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const ROLE_UID = 'plugin::users-permissions.role' as any;
const DEPARTMENT_UID = 'api::department.department' as any;
const KEYCLOAK_PASSWORD_REQUIRED_ACTION = 'UPDATE_PASSWORD';

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

function normalizeText(value: any): string {
  return cleanString(value).toLocaleLowerCase('ru');
}

function primaryWorkplace(workplaces: any[]) {
  return (
    workplaces.find((workplace) => workplace?.primary === true) ||
    workplaces[0] ||
    null
  );
}

function buildInternalEmployeeEmail(iin: string): string {
  return `${iin}@bpm.local`;
}

function buildLegacyEmployeeEmail(iin: string): string {
  const domain = cleanString(process.env.EMPLOYEE_KEYCLOAK_EMAIL_DOMAIN || 'employees.nnmc.kz')
    .replace(/^@+/, '')
    .toLowerCase();
  return `${iin}@${domain}`;
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e',
    ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', қ: 'k', л: 'l', м: 'm',
    н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'c', ч: 'ch',
    ш: 'sh', щ: 'sh', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya',
    ъ: '', ь: '',
  };

  return Array.from(cleanString(value).toLocaleLowerCase('ru'))
    .map((char) => map[char] ?? char)
    .join('');
}

function latinInitial(value: string, fallback: string): string {
  const match = transliterate(value).match(/[a-z]/i);
  return (match?.[0] || fallback).toUpperCase();
}

function namePartsFromCard(card: any) {
  const fioParts = cleanString(card?.fio).split(/\s+/).filter(Boolean);
  const lastName = cleanString(card?.lastName) || fioParts[0] || cleanString(card?.iin);
  const firstName = cleanString(card?.firstName) || fioParts[1] || lastName;
  const middleName = cleanString(card?.middleName) || fioParts.slice(2).join(' ');
  return { firstName, lastName, middleName };
}

function buildInitialPassword(card: any): string {
  const { firstName, lastName } = namePartsFromCard(card);
  return `${cleanString(card?.iin)}${latinInitial(firstName, 'A')}${latinInitial(lastName, 'A')}`;
}

function shouldSyncKeycloak(): boolean {
  return String(process.env.EMPLOYEE_SYNC_KEYCLOAK_ENABLED || 'true').toLowerCase() !== 'false';
}

function keycloakConfig() {
  const url = cleanString(process.env.KEYCLOAK_URL).replace(/\/+$/, '');
  return {
    url,
    realm: cleanString(process.env.KEYCLOAK_REALM) || 'nnmc',
    adminClientId: cleanString(process.env.KEYCLOAK_ADMIN_CLIENT_ID) || 'admin-cli',
    adminClientSecret: cleanString(process.env.KEYCLOAK_ADMIN_CLIENT_SECRET),
  };
}

async function getKeycloakAdminToken(strapi: any): Promise<string | null> {
  const { url, realm, adminClientId, adminClientSecret } = keycloakConfig();
  if (!url || !adminClientSecret) return null;

  const response = await fetch(`${url}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: adminClientId,
      client_secret: adminClientSecret,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    strapi.log.warn(`[employee-sync] Keycloak admin token failed: HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`);
    return null;
  }

  const data = await response.json() as any;
  return data?.access_token || null;
}

async function findKeycloakUser(token: string, username: string, email?: string | null) {
  const { url, realm } = keycloakConfig();
  if (!url) return null;
  const adminBase = `${url}/admin/realms/${realm}`;
  const headers = { Authorization: `Bearer ${token}` };

  if (username) {
    const byUsername = await fetch(
      `${adminBase}/users?username=${encodeURIComponent(username)}&exact=true`,
      { headers }
    );
    if (byUsername.ok) {
      const items = await byUsername.json() as any[];
      if (Array.isArray(items) && items[0]) return items[0];
    }
  }

  if (!email) return null;
  const byEmail = await fetch(
    `${adminBase}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers }
  );
  if (!byEmail.ok) return null;
  const items = await byEmail.json() as any[];
  return Array.isArray(items) ? items[0] : null;
}

async function updateKeycloakProfile(token: string, keycloakUser: any, patch: Record<string, any>) {
  const { url, realm } = keycloakConfig();
  if (!url || !keycloakUser?.id) return;

  const requiredActions = Array.isArray(patch.requiredActions)
    ? patch.requiredActions
    : Array.isArray(keycloakUser.requiredActions)
      ? keycloakUser.requiredActions
      : [];

  const payload: Record<string, any> = {
    username: patch.username ?? keycloakUser.username,
    firstName: patch.firstName ?? keycloakUser.firstName,
    lastName: patch.lastName ?? keycloakUser.lastName,
    enabled: patch.enabled ?? keycloakUser.enabled ?? true,
    emailVerified: patch.email === null ? false : (patch.emailVerified ?? keycloakUser.emailVerified ?? true),
    requiredActions,
    attributes: {
      ...(keycloakUser.attributes || {}),
      ...(patch.attributes || {}),
    },
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
    payload.email = patch.email;
  } else if (keycloakUser.email) {
    payload.email = keycloakUser.email;
  }

  const response = await fetch(`${url}/admin/realms/${realm}/users/${keycloakUser.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Keycloak profile update failed (HTTP ${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
}

async function createKeycloakUser(token: string, profile: Record<string, any>, password: string) {
  const { url, realm } = keycloakConfig();
  if (!url) throw new Error('KEYCLOAK_URL is not configured');

  const payload: Record<string, any> = {
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    enabled: profile.enabled,
    requiredActions: [KEYCLOAK_PASSWORD_REQUIRED_ACTION],
    credentials: [{
      type: 'password',
      value: password,
      temporary: true,
    }],
    attributes: profile.attributes || {},
  };

  if (profile.email) {
    payload.email = profile.email;
    payload.emailVerified = true;
  }

  const response = await fetch(`${url}/admin/realms/${realm}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok && response.status !== 409) {
    const text = await response.text().catch(() => '');
    throw new Error(`Keycloak user create failed (HTTP ${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
  }

  return response.status;
}

async function loadEmployeeRole(strapi: any) {
  const memberRole = await strapi.db.query(ROLE_UID).findOne({ where: { name: 'Member' } });
  if (memberRole) return memberRole;
  return await strapi.db.query(ROLE_UID).findOne({ where: { type: 'authenticated' } });
}

function departmentKeyFromWorkplace(workplace: any, departmentName: string, usedKeys: Set<string>) {
  const rawId = cleanString(workplace?.departmentId);
  const baseFromId = rawId
    ? `ONEC_${rawId}`
    : transliterate(departmentName).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const fallback = createHash('sha1').update(departmentName).digest('hex').slice(0, 8).toUpperCase();
  const compactBase = (baseFromId || `DEP_${fallback}`)
    .replace(/^_+|_+$/g, '')
    .slice(0, 52) || `DEP_${fallback}`;

  let key = compactBase;
  let index = 1;
  while (usedKeys.has(key)) {
    key = `${compactBase.slice(0, 46)}_${fallback}_${index}`;
    index += 1;
  }
  return key;
}

async function ensureDepartmentsFromSource(strapi: any, sourceItems: any[]) {
  const departments = await strapi.db.query(DEPARTMENT_UID).findMany({
    select: ['id', 'key', 'name_ru', 'name_kz'],
  });
  const byName = new Map<string, any>();
  const usedKeys = new Set<string>();

  for (const department of departments || []) {
    const key = cleanString(department.key);
    if (key) usedKeys.add(key);
    for (const value of [department.key, department.name_ru, department.name_kz]) {
      const nameKey = normalizeText(value);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, department);
    }
  }

  let created = 0;

  for (const sourceItem of sourceItems) {
    const workplaces = Array.isArray(sourceItem?.workplaces) ? sourceItem.workplaces : [];
    for (const workplace of workplaces) {
      const departmentName = cleanString(workplace?.department);
      const nameKey = normalizeText(departmentName);
      if (!departmentName || byName.has(nameKey)) continue;

      const key = departmentKeyFromWorkplace(workplace, departmentName, usedKeys);
      usedKeys.add(key);
      const department = await strapi.entityService.create(DEPARTMENT_UID, {
        data: {
          key,
          name_ru: departmentName,
          name_kz: departmentName,
          canViewBpm: false,
          canManageEmployees: false,
        } as any,
      });

      created += 1;
      byName.set(nameKey, department);
      byName.set(normalizeText(key), department);
    }
  }

  return { byName, created };
}

function keycloakProfileFromCard(card: any) {
  const { firstName, lastName, middleName } = namePartsFromCard(card);
  const workplace = primaryWorkplace(Array.isArray(card.workplaces) ? card.workplaces : []);
  const username = cleanString(card.iin);
  const fio = cleanString(card.fio) || [lastName, firstName, middleName].filter(Boolean).join(' ');

  return {
    username,
    email: null,
    firstName,
    lastName,
    enabled: card.active !== false,
    attributes: {
      iin: [],
      fullName: fio ? [fio] : [],
      middleName: middleName ? [middleName] : [],
      employeeCardId: card.id ? [String(card.id)] : [],
      physicalPersonId: card.physicalPersonId ? [String(card.physicalPersonId)] : [],
      department: workplace?.department ? [String(workplace.department)] : [],
      position: workplace?.position ? [String(workplace.position)] : [],
    },
  };
}

async function ensureStrapiEmployeeUser(
  strapi: any,
  card: any,
  role: any,
  departmentsByName: Map<string, any>,
  password: string
) {
  const profile = keycloakProfileFromCard(card);
  const internalEmail = buildInternalEmployeeEmail(profile.username);
  const legacyEmail = buildLegacyEmployeeEmail(profile.username);
  const workplace = primaryWorkplace(Array.isArray(card.workplaces) ? card.workplaces : []);
  const department = departmentsByName.get(normalizeText(workplace?.department));
  const existingByUsername = await strapi.db.query(USER_UID).findOne({
    where: { username: profile.username },
    populate: ['department'],
  });
  const existing = existingByUsername || await strapi.db.query(USER_UID).findOne({
    where: { email: internalEmail },
    populate: ['department'],
  }) || await strapi.db.query(USER_UID).findOne({
    where: { email: legacyEmail },
    populate: ['department'],
  });

  const baseData: Record<string, any> = {
    username: profile.username,
    email: internalEmail,
    firstName: profile.firstName,
    lastName: profile.lastName,
    position: cleanString(workplace?.position),
    confirmed: true,
    blocked: card.active === false,
    provider: 'keycloak',
  };
  if (department?.id) {
    baseData.department = department.id;
  }

  if (existing?.id) {
    const user = await strapi.entityService.update(USER_UID, existing.id, {
      data: baseData as any,
    });
    return { user, created: false };
  }

  if (!role?.id) {
    throw new Error('Authenticated/Member role not found');
  }

  const user = await strapi.entityService.create(USER_UID, {
    data: {
      ...baseData,
      password,
      role: role.id,
    } as any,
  });
  return { user, created: true };
}

async function ensureEmployeeKeycloakAccount(
  strapi: any,
  token: string,
  card: any,
  role: any,
  departmentsByName: Map<string, any>
) {
  const profile = keycloakProfileFromCard(card);
  const password = buildInitialPassword(card);
  const strapiAccount = await ensureStrapiEmployeeUser(strapi, card, role, departmentsByName, password);
  const strapiUser = strapiAccount.user;
  let keycloakUser = await findKeycloakUser(token, profile.username, profile.email);
  let created = false;

  if (!keycloakUser?.id) {
    const createStatus = await createKeycloakUser(token, profile, password);
    created = createStatus !== 409;
    keycloakUser = await findKeycloakUser(token, profile.username, profile.email);
  }

  if (!keycloakUser?.id) {
    throw new Error('Keycloak user was not found after create/update');
  }

  await updateKeycloakProfile(token, keycloakUser, profile);

  await strapi.entityService.update(CARD_UID, card.id, {
    data: {
      user: strapiUser.id,
      keycloakUserId: keycloakUser.id,
      keycloakStatus: card.active === false ? 'disabled' : 'created',
    } as any,
  });

  return {
    created,
    strapiUserCreated: strapiAccount.created,
    userId: strapiUser.id,
    keycloakUserId: keycloakUser.id,
    status: card.active === false ? 'disabled' : 'created',
  };
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

    const departmentNames = new Set<string>();
    for (const sourceItem of allItems) {
      const workplaces = Array.isArray(sourceItem?.workplaces) ? sourceItem.workplaces : [];
      for (const workplace of workplaces) {
        const departmentName = cleanString(workplace?.department);
        if (departmentName) departmentNames.add(normalizeText(departmentName));
      }
    }

    const now = new Date().toISOString();
    const existingCards = await strapi.db.query(CARD_UID).findMany({
      select: ['id', 'iin', 'sourceHash', 'active'],
    });
    const existingByIin = new Map<string, any>(
      existingCards.map((card: any) => [cleanString(card.iin), card])
    );
    const departmentSync = await ensureDepartmentsFromSource(strapi, allItems);
    const seenIins = new Set<string>();
    const stats = {
      received: allItems.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      deactivated: 0,
      skipped: 0,
      workplaceCount: 0,
      departmentCount: departmentNames.size,
      departmentsCreated: departmentSync.created,
      usersCreated: 0,
      usersUpdated: 0,
      keycloakCreated: 0,
      keycloakLinked: 0,
      keycloakDisabled: 0,
      keycloakSkipped: 0,
      keycloakErrors: 0,
    };
    const keycloakEnabled = shouldSyncKeycloak();
    let keycloakToken = keycloakEnabled ? await getKeycloakAdminToken(strapi) : null;
    const employeeRole = keycloakToken ? await loadEmployeeRole(strapi) : null;
    const departmentsByName = departmentSync.byName;
    if (keycloakEnabled && !keycloakToken) {
      issues.push({
        code: 'keycloak_not_configured',
        message: 'Keycloak employee account sync is enabled, but admin token could not be obtained',
      });
    }
    if (keycloakToken && !employeeRole?.id) {
      keycloakToken = null;
      issues.push({
        code: 'employee_role_not_found',
        message: 'Member or Authenticated role was not found; employee account sync skipped',
      });
    }

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
      let persistedCard: any = null;

      if (!existing) {
        persistedCard = await strapi.db.query(CARD_UID).create({
          data: {
            ...card,
            lastSyncedAt: now,
            deactivatedAt: null,
            keycloakStatus: 'not_created',
          },
        });
        stats.created += 1;
      } else if (existing.sourceHash === card.sourceHash && existing.active === card.active) {
        persistedCard = { ...card, id: existing.id };
        stats.unchanged += 1;
      } else {
        persistedCard = await strapi.db.query(CARD_UID).update({
          where: { id: existing.id },
          data: {
            ...card,
            lastSyncedAt: now,
            deactivatedAt: card.active ? null : now,
          },
        });
        stats.updated += 1;
      }

      if (!keycloakToken) {
        stats.keycloakSkipped += 1;
        continue;
      }

      try {
        const account = await ensureEmployeeKeycloakAccount(
          strapi,
          keycloakToken,
          persistedCard,
          employeeRole,
          departmentsByName
        );
        if (account.created) stats.keycloakCreated += 1;
        else stats.keycloakLinked += 1;
        if (account.status === 'disabled') stats.keycloakDisabled += 1;
        if (account.strapiUserCreated) stats.usersCreated += 1;
        else stats.usersUpdated += 1;
      } catch (error: any) {
        stats.keycloakErrors += 1;
        await strapi.db.query(CARD_UID).update({
          where: { id: persistedCard.id },
          data: { keycloakStatus: 'error' },
        }).catch(() => {});
        issues.push({
          code: 'keycloak_sync_failed',
          iin: card.iin,
          fio: card.fio,
          message: error?.message || String(error),
        });
      }
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
