import { factories } from '@strapi/strapi';
import { getUserFlags } from '../../../utils/project-assignments';
import { publishNotificationCreated, publishToUser } from '../../../utils/notification-realtime';
import { createAuditEvent } from '../../../utils/audit-event';

const TICKET_UID = 'api::ticket.ticket';
const HOUSEHOLD_EXECUTOR_UID = 'api::household-executor.household-executor';
const HELP_SERVICE_DEPARTMENT_KEYS = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];
const TICKET_POPULATE = [
  'category',
  'serviceGroup',
  'serviceGroup.department',
  'targetDepartment',
  'householdExecutor',
  'assignee',
  'assignee.department',
  'attachments',
  'requester',
  'completedBy',
] as any;
const LEGACY_IT_CATEGORY_SLUG_BY_ID: Record<string, string> = {
  PCR: 'computer-breakdown',
  webCabel: 'network',
  printer: 'printer',
  printerCard: 'cartridge',
  PO: 'office-software',
  '1C': '1c-support',
  Damumed: 'damumed',
  mzrk: 'mzrk',
  lis: 'lis',
  DOC: 'documentolog',
  'simbase-t': 'simbase-password',
  'simbase-p': 'simbase-account',
  'simbase-a': 'simbase',
  skud: 'access-control',
  'skud-p': 'access-control-repair',
  Domen: 'domain-account',
};
const LEGACY_DEPARTMENT_KEY_BY_PORT: Record<string, string> = {
  '8080': 'IT',
  '8081': 'MEDICAL_EQUIPMENT',
  '8082': 'ENGINEERING',
};

function extractRelationId(relation: any): number | null {
  if (!relation) return null;
  if (typeof relation === 'number') return relation;
  if (typeof relation === 'string') {
    const parsed = parseInt(relation, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (relation.id) return relation.id;
  if (relation.connect && Array.isArray(relation.connect) && relation.connect[0]?.id) {
    return relation.connect[0].id;
  }
  if (relation.set && Array.isArray(relation.set) && relation.set[0]?.id) {
    return relation.set[0].id;
  }
  return null;
}

function extractRelationIds(relation: any): number[] {
  if (!relation) return [];
  if (Array.isArray(relation)) {
    return relation.map(extractRelationId).filter((id): id is number => Boolean(id));
  }
  const one = extractRelationId(relation);
  if (one) return [one];
  if (relation.connect && Array.isArray(relation.connect)) {
    return relation.connect.map(extractRelationId).filter((id: number | null): id is number => Boolean(id));
  }
  if (relation.set && Array.isArray(relation.set)) {
    return relation.set.map(extractRelationId).filter((id: number | null): id is number => Boolean(id));
  }
  return [];
}

function getUserDisplayName(user: any): string {
  return (
    `${user?.lastName || ''} ${user?.firstName || ''}`.trim() ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    ''
  );
}

function isKuatHelpdeskHead(user: any): boolean {
  const username = String(user?.username || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  return username === 'kuat' || email === 'kuat@nnmc.kz';
}

function normalizePermissionText(value: any): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

function userHasAnyToken(user: any, tokens: string[]): boolean {
  const haystack = [
    user?.position,
    user?.role?.name,
    user?.role?.type,
    user?.role?.description,
  ]
    .map(normalizePermissionText)
    .filter(Boolean)
    .join(' ');
  return tokens.some((token) => haystack.includes(token));
}

function isDepartmentHead(user: any): boolean {
  return userHasAnyToken(user, [
    'руковод',
    'началь',
    'завед',
    'директор',
    'глав',
    'head',
    'chief',
    'lead',
    'басшы',
  ]);
}

export function isHelpdeskRoutingAdmin(user: any, isSuperAdmin = false): boolean {
  if (isSuperAdmin || isKuatHelpdeskHead(user)) return true;
  if (user?.canManageTickets === true) return true;
  if (user?.department?.canManageTickets === true) return true;
  return userHasAnyToken(user, ['superadmin', 'super admin', 'admin', 'админ']);
}

function userCanViewDepartmentQueue(user: any, isSuperAdmin = false): boolean {
  return isHelpdeskRoutingAdmin(user, isSuperAdmin) || isDepartmentHead(user);
}

function userCanTransferBetweenDepartments(user: any, isSuperAdmin = false): boolean {
  return userCanViewDepartmentQueue(user, isSuperAdmin);
}

export function userCanManageHouseholdExecutors(user: any, isSuperAdmin = false): boolean {
  // Deliberately narrower than isHelpdeskRoutingAdmin: the free-text "админ/admin"
  // position match would grant executor management to unrelated staff
  // (e.g. "Администратор регистратуры"), so only explicit signals count here.
  if (isSuperAdmin || isKuatHelpdeskHead(user)) return true;
  if (user?.canManageTickets === true) return true;
  return user?.department?.key === 'ENGINEERING' && userCanViewDepartmentQueue(user, isSuperAdmin);
}

function normalizeKazakhstanPhone(value: any): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('7')) return `+7${digits}`;
  return null;
}

function formatUserForClient(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    department: user.department
      ? {
          id: user.department.id,
          key: user.department.key,
          name_ru: user.department.name_ru,
          name_kz: user.department.name_kz,
        }
      : null,
  };
}

function formatDepartmentForClient(department: any) {
  if (!department) return null;
  return {
    id: department.id,
    key: department.key,
    name_ru: department.name_ru,
    name_kz: department.name_kz,
  };
}

function formatHouseholdExecutorForClient(executor: any) {
  if (!executor) return null;
  return {
    id: executor.id,
    documentId: executor.documentId,
    name: executor.name,
    active: executor.active !== false,
    sortOrder: executor.sortOrder || 0,
  };
}

function getInitialComplexityForDepartment(department: any): 'C' | null {
  return department?.key === 'IT' ? 'C' : null;
}

function getTicketUserIds(ticket: any): number[] {
  return Array.from(
    new Set([
      ...extractRelationIds(ticket?.assignee),
      ...extractRelationIds(ticket?.requester),
    ])
  );
}

async function publishTicketRealtime(strapi: any, ticket: any, type = 'tickets:updated') {
  const userIds = getTicketUserIds(ticket);
  const targetDepartmentId = extractRelationId(ticket?.targetDepartment);

  if (targetDepartmentId) {
    try {
      const departmentUsers = (await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters: { department: { id: targetDepartmentId }, blocked: false } as any,
        fields: ['id'],
        pagination: { pageSize: 1000 },
      })) as any[];
      userIds.push(...(departmentUsers || []).map((departmentUser: any) => Number(departmentUser.id)).filter(Boolean));
    } catch (error: any) {
      strapi.log.warn(`[tickets] Could not publish ticket realtime to department: ${error?.message || error}`);
    }
  }

  const uniqueUserIds = Array.from(new Set(userIds));
  await Promise.all(
    uniqueUserIds.map((userId) =>
      publishToUser(strapi, userId, {
        type,
        ticketId: ticket?.id || null,
        ticketDocumentId: ticket?.documentId || null,
        ticketNumber: ticket?.ticketNumber || null,
        status: ticket?.status || null,
      })
    )
  );
}

function userCanManageTicket(userWithDept: any, ticket: any, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin || isKuatHelpdeskHead(userWithDept)) return true;
  const userId = Number(userWithDept?.id);
  const assigneeIds = extractRelationIds(ticket?.assignee);

  if (assigneeIds.includes(userId)) return true;
  if (userCanViewDepartmentQueue(userWithDept, isSuperAdmin)) {
    const userDeptKey = userWithDept?.department?.key;
    const ticketDeptKey = ticket?.targetDepartment?.key || ticket?.serviceGroup?.department?.key;
    return Boolean(userDeptKey && ticketDeptKey === userDeptKey);
  }

  return false;
}

function ticketBelongsToUserDepartment(userWithDept: any, ticket: any): boolean {
  const userDeptKey = userWithDept?.department?.key;
  if (!userDeptKey) return false;
  const ticketDeptKey = ticket?.targetDepartment?.key || ticket?.serviceGroup?.department?.key;
  return ticketDeptKey === userDeptKey;
}

function userCanReassignTicket(userWithDept: any, ticket: any, isSuperAdmin: boolean): boolean {
  if (userCanManageTicket(userWithDept, ticket, isSuperAdmin)) return true;
  const userId = Number(userWithDept?.id);
  const assigneeIds = extractRelationIds(ticket?.assignee);
  if (assigneeIds.includes(userId)) return true;
  return userCanViewDepartmentQueue(userWithDept, isSuperAdmin) && ticketBelongsToUserDepartment(userWithDept, ticket);
}

function userCanViewTicket(userWithDept: any, ticket: any, isSuperAdmin: boolean): boolean {
  if (userCanManageTicket(userWithDept, ticket, isSuperAdmin)) return true;
  const userId = Number(userWithDept?.id);
  const requesterIds = extractRelationIds(ticket?.requester);
  return requesterIds.includes(userId);
}

async function getTicketByDocumentId(strapi: any, documentId: string) {
  const tickets = (await strapi.entityService.findMany('api::ticket.ticket', {
    filters: { documentId } as any,
    populate: TICKET_POPULATE,
    limit: 1,
  })) as any[];

  return tickets?.[0] || null;
}

function normalizeFileIds(input: any): number[] {
  const raw = Array.isArray(input) ? input : input ? [input] : [];
  return Array.from(
    new Set(
      raw
        .map((value: any) => Number(value?.id || value))
        .filter((value: number) => Number.isFinite(value) && value > 0)
    )
  );
}

function normalizeUploadFiles(files: any): any[] {
  const raw = files?.files || files?.file || files;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function normalizeTicketSubmitBody(body: any) {
  if (!body) return {};
  if (typeof body.data === 'string') {
    try {
      return JSON.parse(body.data);
    } catch {
      return body;
    }
  }
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
}

function normalizeLegacyCategoryText(value: any): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getDefaultLegacyServiceGroup(strapi: any) {
  const bySlug = (await strapi.entityService.findMany('api::service-group.service-group', {
    filters: { slug: 'it-support' } as any,
    populate: ['department'],
    limit: 1,
  })) as any[];
  if (bySlug?.[0]?.id) return bySlug[0];

  const byDepartment = (await strapi.entityService.findMany('api::service-group.service-group', {
    filters: { department: { key: 'IT' } } as any,
    populate: ['department'],
    limit: 1,
  })) as any[];
  return byDepartment?.[0] || null;
}

export function getLegacyDepartmentKeyFromHeaders(headers: any): string {
  const rawOrigin = String(headers?.origin || headers?.Origin || '').trim();
  const rawReferer = String(headers?.referer || headers?.Referer || '').trim();
  const candidates = [rawOrigin, rawReferer].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const departmentKey = LEGACY_DEPARTMENT_KEY_BY_PORT[url.port];
      if (departmentKey) return departmentKey;
    } catch {
      const matchedPort = candidate.match(/:(8080|8081|8082)(?:\/|$)/)?.[1];
      if (matchedPort && LEGACY_DEPARTMENT_KEY_BY_PORT[matchedPort]) {
        return LEGACY_DEPARTMENT_KEY_BY_PORT[matchedPort];
      }
    }
  }

  return '';
}

export function buildTicketSearchFilter(search: string) {
  return {
    $or: [
      { requesterName: { $containsi: search } },
      { requesterPhone: { $containsi: search } },
      { ticketNumber: { $containsi: search } },
      { requesterDepartment: { $containsi: search } },
      { comment: { $containsi: search } },
      { staffComment: { $containsi: search } },
      { category: { name_ru: { $containsi: search } } },
      { category: { name_kz: { $containsi: search } } },
      { category: { slug: { $containsi: search } } },
    ],
  };
}

async function findLegacyServiceGroup(strapi: any, body: any, headers?: any) {
  const serviceGroupId = Number(body.serviceGroupId);
  if (Number.isFinite(serviceGroupId) && serviceGroupId > 0) {
    const byId = await strapi.entityService.findOne('api::service-group.service-group', serviceGroupId, {
      populate: ['department'],
    });
    if (byId?.id) return byId;
  }

  const serviceGroupSlug = String(body.serviceGroupSlug || '').trim();
  if (serviceGroupSlug) {
    const bySlug = (await strapi.entityService.findMany('api::service-group.service-group', {
      filters: { slug: serviceGroupSlug } as any,
      populate: ['department'],
      limit: 1,
    })) as any[];
    if (bySlug?.[0]?.id) return bySlug[0];
  }

  const departmentKey = String(body.departmentKey || body.serviceDepartmentKey || '').trim();
  if (departmentKey) {
    const byDepartment = (await strapi.entityService.findMany('api::service-group.service-group', {
      filters: { department: { key: departmentKey } } as any,
      populate: ['department'],
      limit: 1,
    })) as any[];
    if (byDepartment?.[0]?.id) return byDepartment[0];
  }

  const departmentKeyFromHeaders = getLegacyDepartmentKeyFromHeaders(headers);
  if (departmentKeyFromHeaders) {
    const byDepartment = (await strapi.entityService.findMany('api::service-group.service-group', {
      filters: { department: { key: departmentKeyFromHeaders } } as any,
      populate: ['department'],
      limit: 1,
    })) as any[];
    if (byDepartment?.[0]?.id) return byDepartment[0];
  }

  return await getDefaultLegacyServiceGroup(strapi);
}

async function findFallbackCategory(strapi: any, serviceGroupId: number) {
  const categories = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
    filters: { serviceGroup: { id: serviceGroupId } } as any,
    pagination: { pageSize: 1000 },
  })) as any[];

  return (
    (categories || []).find((category: any) => {
      const slug = String(category.slug || '').toLowerCase();
      const nameRu = normalizeLegacyCategoryText(category.name_ru);
      const nameKz = normalizeLegacyCategoryText(category.name_kz);
      return slug.endsWith('-other') || slug === 'other' || nameRu === 'другое' || nameKz === 'баска';
    }) || null
  );
}

async function findLegacyTicketCategory(
  strapi: any,
  serviceGroupId: number,
  categoryId: any,
  legacyCategoryId: any,
  legacyCategoryName: any
) {
  const normalizedCategoryId = Number(categoryId);
  if (Number.isFinite(normalizedCategoryId) && normalizedCategoryId > 0) {
    const category = (await strapi.entityService.findOne(
      'api::ticket-category.ticket-category',
      normalizedCategoryId,
      { populate: ['serviceGroup'] }
    )) as any;
    if (category?.id && Number(category.serviceGroup?.id) === Number(serviceGroupId)) {
      return category;
    }
  }

  const legacySlug = LEGACY_IT_CATEGORY_SLUG_BY_ID[String(legacyCategoryId || '')];
  if (legacySlug) {
    const bySlug = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
      filters: { slug: legacySlug, serviceGroup: { id: serviceGroupId } } as any,
      limit: 1,
    })) as any[];
    if (bySlug?.[0]?.id) return bySlug[0];
  }

  const wanted = normalizeLegacyCategoryText(legacyCategoryName);
  if (!wanted) return await findFallbackCategory(strapi, serviceGroupId);

  const categories = (await strapi.entityService.findMany('api::ticket-category.ticket-category', {
    filters: { serviceGroup: { id: serviceGroupId } } as any,
    pagination: { pageSize: 1000 },
  })) as any[];

  const matchedCategory =
    (categories || []).find((category: any) => {
      const nameRu = normalizeLegacyCategoryText(category.name_ru);
      const nameKz = normalizeLegacyCategoryText(category.name_kz);
      return (
        (nameRu && (nameRu === wanted || nameRu.includes(wanted) || wanted.includes(nameRu))) ||
        (nameKz && (nameKz === wanted || nameKz.includes(wanted) || wanted.includes(nameKz)))
      );
    }) || null;

  return matchedCategory || (await findFallbackCategory(strapi, serviceGroupId));
}

async function attachTicketFiles(strapi: any, ticketId: number, fileIds: number[]) {
  if (!ticketId || fileIds.length === 0) return;
  await Promise.all(
    fileIds.map((fileId) =>
      strapi.db.query('plugin::upload.file').update({
        where: { id: fileId },
        data: {
          related: [
            {
              id: ticketId,
              __type: TICKET_UID,
              __pivot: { field: 'attachments' },
            },
          ],
        },
      })
    )
  );
}

async function uploadAndAttachTicketFiles(strapi: any, ticketId: number, files: any[]) {
  if (!ticketId || files.length === 0) return [];
  const uploaded = await strapi.plugin('upload').service('upload').upload({
    data: {
      ref: TICKET_UID,
      refId: ticketId,
      field: 'attachments',
    },
    files: files.length === 1 ? files[0] : files,
  });
  const uploadedList = Array.isArray(uploaded) ? uploaded : [uploaded];
  const uploadedIds = normalizeFileIds(uploadedList);
  if (uploadedIds.length > 0) {
    await attachTicketFiles(strapi, ticketId, uploadedIds);
  }
  return uploadedIds;
}

async function notifyTicketAssignees(strapi: any, ticketId: number) {
  try {
    const ticket = (await strapi.entityService.findOne('api::ticket.ticket', ticketId, {
      populate: ['assignee', 'category', 'serviceGroup', 'requester', 'targetDepartment'],
    })) as any;
    if (!ticket) return null;

    const assigneeIds = Array.from(new Set(extractRelationIds(ticket.assignee)));
    if (assigneeIds.length === 0) return ticket;

    const categoryName = ticket.category?.name_ru || ticket.category?.name_kz || 'Заявка';
    const body = String(ticket.comment || '').trim();
    const createdNotifications = await Promise.all(
      assigneeIds.map((recipientId) =>
        strapi.entityService.create('api::notification.notification', {
          data: {
            recipient: recipientId,
            title: `Новая заявка ${ticket.ticketNumber || ''}`.trim(),
            body: `${categoryName}${body ? `: ${body.slice(0, 200)}` : ''}`,
            type: 'helpdesk',
            link: `/app/helpdesk/${ticket.documentId || ticket.id}`,
            isRead: false,
            metadata: {
              ticketId: ticket.id,
              ticketDocumentId: ticket.documentId || null,
              ticketNumber: ticket.ticketNumber || null,
              category: categoryName,
            },
          },
        })
      )
    );
    await Promise.all(
      createdNotifications.map((notification, index) =>
        publishNotificationCreated(strapi, Number(assigneeIds[index]), notification)
      )
    );
    await publishTicketRealtime(strapi, ticket, 'tickets:new');

    return ticket;
  } catch (error: any) {
    strapi.log.warn(`[tickets] Could not notify ticket assignees: ${error?.message || error}`);
    return null;
  }
}

async function assignDefaultCategoryAssignees(strapi: any, ticketId: number, categoryId: any) {
  const normalizedCategoryId = Number(categoryId);
  if (!ticketId || !Number.isFinite(normalizedCategoryId) || normalizedCategoryId <= 0) return null;

  const category = (await strapi.entityService.findOne(
    'api::ticket-category.ticket-category',
    normalizedCategoryId,
    { populate: ['defaultAssignee'] }
  )) as any;

  const assigneeIds = Array.from(new Set(extractRelationIds(category?.defaultAssignee)));
  if (assigneeIds.length === 0) return null;

  return await strapi.entityService.update('api::ticket.ticket', ticketId, {
    data: {
      assignee: {
        set: assigneeIds.map((id) => ({ id })),
      },
    },
    populate: TICKET_POPULATE,
  });
}

async function findServiceGroupByDepartmentKey(strapi: any, departmentKey: string) {
  const groups = (await strapi.entityService.findMany('api::service-group.service-group', {
    filters: { department: { key: departmentKey } } as any,
    populate: ['department'],
    limit: 1,
  })) as any[];
  return groups?.[0] || null;
}

async function notifyTicketDepartmentOwners(strapi: any, ticket: any, department: any, reason: string) {
  const departmentId = Number(department?.id || 0);
  if (!departmentId) return;

  try {
    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: { department: { id: departmentId }, blocked: false } as any,
      fields: ['id', 'username', 'email', 'firstName', 'lastName', 'position', 'canManageTickets'],
      populate: ['department', 'role'],
      pagination: { pageSize: 1000 },
    })) as any[];

    const ownerIds = (users || [])
      .filter((departmentUser: any) => isDepartmentHead(departmentUser) || isHelpdeskRoutingAdmin(departmentUser))
      .map((departmentUser: any) => Number(departmentUser.id))
      .filter(Boolean);
    const fallbackIds = (users || []).map((departmentUser: any) => Number(departmentUser.id)).filter(Boolean);
    const recipientIds = Array.from(new Set(ownerIds.length > 0 ? ownerIds : fallbackIds));

    const notifications = await Promise.all(
      recipientIds.map((recipientId) =>
        strapi.entityService.create('api::notification.notification', {
          data: {
            recipient: recipientId,
            title: `Заявка передана в отдел ${department.name_ru || department.name_kz || ''}`.trim(),
            body: `${ticket.ticketNumber || 'HelpDesk'}${reason ? `: ${reason.slice(0, 200)}` : ''}`,
            type: 'helpdesk',
            link: `/app/helpdesk/${ticket.documentId || ticket.id}`,
            isRead: false,
            metadata: {
              ticketId: ticket.id,
              ticketDocumentId: ticket.documentId || null,
              ticketNumber: ticket.ticketNumber || null,
              targetDepartmentId: department.id,
              reason,
            },
          },
        })
      )
    );

    await Promise.all(
      notifications.map((notification, index) =>
        publishNotificationCreated(strapi, Number(recipientIds[index]), notification)
      )
    );
  } catch (error: any) {
    strapi.log.warn(`[tickets] Could not notify target department owners: ${error?.message || error}`);
  }
}

export default factories.createCoreController('api::ticket.ticket', ({ strapi }) => ({
  async formatAssigneesForClient(assigneeInput: any) {
    const assigneeList = Array.isArray(assigneeInput)
      ? assigneeInput
      : assigneeInput
      ? [assigneeInput]
      : [];

    const result: any[] = [];
    for (const assignee of assigneeList) {
      const assigneeId =
        typeof assignee === 'number'
          ? assignee
          : typeof assignee?.id === 'number'
          ? assignee.id
          : null;
      if (!assigneeId) continue;

      if (assignee?.username || assignee?.firstName || assignee?.lastName) {
        result.push({
          id: assigneeId,
          username: assignee.username,
          email: assignee.email,
          firstName: assignee.firstName,
          lastName: assignee.lastName,
          department: assignee.department
            ? {
                id: assignee.department.id,
                key: assignee.department.key,
                name_ru: assignee.department.name_ru,
                name_kz: assignee.department.name_kz,
              }
            : null,
        });
        continue;
      }

      const fullUser = (await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        assigneeId,
        {
          fields: ['id', 'username', 'email', 'firstName', 'lastName'],
          populate: ['department'],
        }
      )) as any;

      if (fullUser) {
        result.push({
          id: fullUser.id,
          username: fullUser.username,
          email: fullUser.email,
          firstName: fullUser.firstName,
          lastName: fullUser.lastName,
          department: fullUser.department
            ? {
                id: fullUser.department.id,
                key: fullUser.department.key,
                name_ru: fullUser.department.name_ru,
                name_kz: fullUser.department.name_kz,
              }
            : null,
        });
      }
    }

    return result;
  },

  async formatTicketForClient(ticket: any) {
    if (!ticket) return ticket;
    return {
      ...ticket,
      householdExecutor: formatHouseholdExecutorForClient(ticket.householdExecutor),
      assignee: await (this as any).formatAssigneesForClient(ticket.assignee),
      requester: formatUserForClient(ticket.requester),
      completedBy: formatUserForClient(ticket.completedBy),
      targetDepartment: formatDepartmentForClient(ticket.targetDepartment),
    };
  },

  // Custom endpoint that bypasses Strapi's strict query validation
  async findFiltered(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const query = ctx.query as any;
    const myTicketsOnly = query.myTickets === 'true' || query.myTickets === true;
    const submittedByMe = query.submittedByMe === 'true' || query.submittedByMe === true;
    const assigneeId = query.assigneeId ? parseInt(query.assigneeId) : undefined;
    const categoryId = query.categoryId ? parseInt(query.categoryId) : undefined;
    const status = query.status as string | undefined;
    const search = query.search as string | undefined;
    const page = parseInt(query.page) || 1;
    const pageSize = parseInt(query.pageSize) || 100;

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const dept = userWithDept?.department;
    const isHelpdeskHead = isKuatHelpdeskHead(userWithDept);
    const canViewQueue = userCanViewDepartmentQueue(userWithDept, isSuperAdmin);

    const andFilters: any[] = [];

    if (status && status !== 'ALL') {
      andFilters.push({ status });
    }

    if (search) {
      andFilters.push(buildTicketSearchFilter(search));
    }

    if (categoryId) {
      andFilters.push({ category: { id: categoryId } });
    }

    if (submittedByMe) {
      andFilters.push({ requester: { id: user.id } });
    } else if (isSuperAdmin || isHelpdeskHead) {
      andFilters.push({
        $or: [
          {
            serviceGroup: {
              department: {
                key: { $in: HELP_SERVICE_DEPARTMENT_KEYS },
              },
            },
          },
          { targetDepartment: { key: { $in: HELP_SERVICE_DEPARTMENT_KEYS } } },
        ],
      });
      if (myTicketsOnly) {
        andFilters.push({ assignee: { id: user.id } });
      } else if (assigneeId) {
        andFilters.push({ assignee: { id: assigneeId } });
      }
    } else if (canViewQueue) {
      const deptKey = dept?.key;

      if (!deptKey) {
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize, pageCount: 0 } } };
        return;
      }

      if (myTicketsOnly && deptKey !== 'ENGINEERING') {
        andFilters.push({ assignee: { id: user.id } });
      } else {
        andFilters.push({
          $or: [
            { targetDepartment: { key: deptKey } },
            { serviceGroup: { department: { key: deptKey } } },
          ],
        });
        if (assigneeId) {
          andFilters.push({ assignee: { id: assigneeId } });
        }
      }
    } else {
      andFilters.push({ assignee: { id: user.id } });
    }

    const filters = andFilters.length > 1 ? { $and: andFilters } : andFilters[0] || {};

    const [tickets, total] = await Promise.all([
      strapi.entityService.findMany('api::ticket.ticket', {
        filters,
        populate: TICKET_POPULATE,
        sort: { createdAt: 'desc' } as any,
        start: (page - 1) * pageSize,
        limit: pageSize,
      }),
      strapi.entityService.count('api::ticket.ticket', { filters }),
    ]);

    const normalizedTickets = await Promise.all(
      (tickets || []).map((ticket: any) => (this as any).formatTicketForClient(ticket))
    );

    ctx.body = {
      data: normalizedTickets,
      meta: {
        pagination: {
          total,
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
        },
      },
    };
  },

  async myRequests(ctx) {
    ctx.query = {
      ...(ctx.query as any),
      submittedByMe: true,
    };
    return await (this as any).findFiltered(ctx);
  },

  async find(ctx) {
    return await (this as any).findFiltered(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const { id } = ctx.params;

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const ticket = await getTicketByDocumentId(strapi, id);
    if (!ticket) {
      ctx.throw(404, 'Ticket not found');
      return;
    }

    if (!userCanViewTicket(userWithDept, ticket, isSuperAdmin)) {
      ctx.throw(404, 'Ticket not found');
      return;
    }

    const normalizedTicket = await (this as any).formatTicketForClient(ticket);
    ctx.body = { data: normalizedTicket };
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);

    const existingTicket = await getTicketByDocumentId(strapi, ctx.params.id);
    if (!existingTicket) {
      ctx.throw(404, 'Ticket not found');
      return;
    }
    if (!userCanManageTicket(userWithDept, existingTicket, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const input = ctx.request.body?.data || {};
    const data: any = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.complexity !== undefined) data.complexity = input.complexity || null;
    if (input.staffComment !== undefined) data.staffComment = input.staffComment || null;

    const nextStatus = data.status;
    const assigneeIds = extractRelationIds(existingTicket?.assignee);

    if (nextStatus === 'IN_PROGRESS') {
      if (existingTicket?.status === 'NEW' && assigneeIds.includes(Number(user.id))) {
        data.assignee = {
          set: [{ id: Number(user.id) }],
        };
      }
    }

    if (nextStatus === 'DONE' && existingTicket?.status !== 'DONE') {
      data.completedBy = Number(user.id);
      data.completedAt = new Date().toISOString();
      if (assigneeIds.includes(Number(user.id))) {
        data.assignee = {
          set: [{ id: Number(user.id) }],
        };
      }
    } else if (nextStatus && nextStatus !== 'DONE' && existingTicket?.status === 'DONE') {
      data.completedBy = null;
      data.completedAt = null;
    }

    const result: any = await strapi.entityService.update('api::ticket.ticket', existingTicket.id, {
      data,
      populate: TICKET_POPULATE,
    });
    await publishTicketRealtime(strapi, result, 'tickets:updated');
    const normalizedTicket = await (this as any).formatTicketForClient(result);
    ctx.body = { data: normalizedTicket };
  },

  async delete(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!isSuperAdmin) {
      ctx.throw(403, 'Only SuperAdmin can delete tickets');
      return;
    }

    const existingTicket = await getTicketByDocumentId(strapi, ctx.params.id);
    if (!existingTicket) {
      ctx.throw(404, 'Ticket not found');
      return;
    }

    await strapi.entityService.delete('api::ticket.ticket', existingTicket.id);
    await publishTicketRealtime(strapi, existingTicket, 'tickets:deleted');
    await createAuditEvent(strapi, {
      action: 'ticket.delete',
      entityType: TICKET_UID,
      entityId: existingTicket.id,
      actor: Number(user.id),
      oldData: {
        ticketNumber: existingTicket.ticketNumber || null,
        requesterName: existingTicket.requesterName || null,
        targetDepartment: formatDepartmentForClient(
          existingTicket.targetDepartment || existingTicket.serviceGroup?.department
        ),
        assigneeIds: extractRelationIds(existingTicket.assignee),
        status: existingTicket.status || null,
      },
    });

    ctx.body = {
      data: {
        id: existingTicket.id,
        documentId: existingTicket.documentId,
      },
    };
  },

  async submit(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const body = normalizeTicketSubmitBody(ctx.request.body as any);
    const { requesterPhone, comment, categoryId, serviceGroupId, attachments } = body;
    const normalizedPhone = normalizeKazakhstanPhone(requesterPhone);

    if (!comment || !serviceGroupId || !normalizedPhone) {
      ctx.throw(400, 'Required fields: requesterPhone, comment, serviceGroupId');
      return;
    }
    if (!categoryId) {
      ctx.throw(400, 'Вы не выбрали категорию заявки');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;

    const serviceGroup = (await strapi.entityService.findOne(
      'api::service-group.service-group',
      serviceGroupId,
      { populate: ['department'] }
    )) as any;
    if (!serviceGroup) {
      ctx.throw(400, 'Служба не найдена');
      return;
    }

    if (!HELP_SERVICE_DEPARTMENT_KEYS.includes(serviceGroup.department?.key)) {
      ctx.throw(400, 'Доступна подача только в службы Helpdesk');
      return;
    }

    let finalCategoryId = categoryId || null;
    if (finalCategoryId) {
      const category = (await strapi.entityService.findOne(
        'api::ticket-category.ticket-category',
        finalCategoryId,
        { populate: ['serviceGroup'] }
      )) as any;
      if (!category || Number(category.serviceGroup?.id) !== Number(serviceGroup.id)) {
        ctx.throw(400, 'Категория не найдена в выбранной службе');
        return;
      }
    }

    const requesterName = getUserDisplayName(userWithDept);
    const requesterDepartment = String(
      userWithDept?.department?.name_ru || userWithDept?.department?.name_kz || ''
    ).trim();

    const ticketData: any = {
      requesterName,
      requesterPhone: normalizedPhone,
      requesterDepartment:
        requesterDepartment ||
        'Не указан',
      comment,
      requester: user.id,
      serviceGroup: serviceGroup.id,
      targetDepartment: serviceGroup.department?.id || null,
      status: 'NEW',
      ticketNumber: 'TEMP',
    };
    const initialComplexity = getInitialComplexityForDepartment(serviceGroup.department);
    if (initialComplexity) {
      ticketData.complexity = initialComplexity;
    }

    if (finalCategoryId) {
      ticketData.category = finalCategoryId;
    }

    const ticket = (await strapi.entityService.create('api::ticket.ticket', {
      data: ticketData,
    })) as any;
    const attachmentIds = normalizeFileIds(attachments);
    if (attachmentIds.length > 0) {
      await attachTicketFiles(strapi, ticket.id, attachmentIds);
    }
    const files = normalizeUploadFiles((ctx.request as any).files);
    if (files.length > 0) {
      await uploadAndAttachTicketFiles(strapi, ticket.id, files);
    }
    await assignDefaultCategoryAssignees(strapi, ticket.id, finalCategoryId);
    const ticketWithAssignees = await notifyTicketAssignees(strapi, ticket.id);
    const responseTicket = ticketWithAssignees || ticket;

    ctx.body = {
      data: {
        ticketNumber: responseTicket.ticketNumber,
        id: responseTicket.id,
        documentId: responseTicket.documentId,
      },
    };
  },

  async uploadAttachments(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const files = normalizeUploadFiles((ctx.request as any).files);
    if (files.length === 0) {
      ctx.throw(400, 'No files uploaded');
      return;
    }

    const uploaded = await strapi.plugin('upload').service('upload').upload({
      data: {},
      files: files.length === 1 ? files[0] : files,
    });
    const normalized = (Array.isArray(uploaded) ? uploaded : [uploaded]).map((file: any) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      mime: file.mime,
      size: file.size,
      ext: file.ext,
    }));

    ctx.body = { data: normalized };
  },

  async publicSubmit(ctx) {
    if (ctx.state.user) {
      return await (this as any).submit(ctx);
    }
    ctx.throw(401, 'Not authenticated');
    return;
  },

  async categories(ctx) {
    const serviceGroups = (await strapi.entityService.findMany(
      'api::service-group.service-group',
      {
        filters: { department: { key: { $in: HELP_SERVICE_DEPARTMENT_KEYS } } } as any,
        populate: ['categories', 'department'],
        sort: { name_ru: 'asc' } as any,
      }
    )) as any[];

    const result = (serviceGroups || []).map((sg: any) => ({
      id: sg.id,
      documentId: sg.documentId,
      name_ru: sg.name_ru,
      name_kz: sg.name_kz,
      slug: sg.slug,
      categories: (sg.categories || [])
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((cat: any) => ({
          id: cat.id,
          documentId: cat.documentId,
          name_ru: cat.name_ru,
          name_kz: cat.name_kz,
          slug: cat.slug,
          order: cat.order,
        })),
    }));

    ctx.body = { data: result };
  },

  async publicCategories(ctx) {
    if (ctx.state.user) {
      return await (this as any).categories(ctx);
    }
    ctx.throw(401, 'Not authenticated');
    return;
  },

  async legacyPublicSubmit(ctx) {
    const body = normalizeTicketSubmitBody(ctx.request.body as any);
    const requesterName = String(body.requesterName || body.userName || '').trim();
    const requesterPhone = String(body.requesterPhone || body.userPhone || '').trim() || null;
    const requesterDepartment = String(body.requesterDepartment || body.userSide || '').trim();
    const rawComment = String(body.comment || body.userComment || '').trim();
    const legacyCategoryName = String(
      body.legacyCategoryName || body.userQuery || body.categoryName || ''
    ).trim();
    const categoryId = body.categoryId;

    if (!requesterName || !rawComment || !requesterDepartment) {
      ctx.throw(400, 'Обязательные поля: requesterName, requesterDepartment, comment');
      return;
    }

    let serviceGroup = await findLegacyServiceGroup(strapi, body, ctx.request?.headers);
    if (!serviceGroup) {
      ctx.throw(400, 'Служба не найдена');
      return;
    }

    const serviceGroupId = serviceGroup.id;
    const category = await findLegacyTicketCategory(
      strapi,
      Number(serviceGroupId),
      categoryId,
      body.legacyCategoryId,
      legacyCategoryName
    );
    const comment = legacyCategoryName
      ? `${rawComment}\n\nКатегория старого HelpDesk: ${legacyCategoryName}`
      : rawComment;

    const ticketData: any = {
      requesterName,
      requesterPhone,
      requesterDepartment,
      comment,
      serviceGroup: serviceGroupId,
      targetDepartment: serviceGroup.department?.id || null,
      status: 'NEW',
      ticketNumber: 'TEMP',
    };
    const initialComplexity = getInitialComplexityForDepartment(serviceGroup.department);
    if (initialComplexity) {
      ticketData.complexity = initialComplexity;
    }

    if (category?.id) {
      ticketData.category = category.id;
    }

    const ticket = (await strapi.entityService.create('api::ticket.ticket', {
      data: ticketData,
    })) as any;
    const ticketWithAssignees = await assignDefaultCategoryAssignees(strapi, ticket.id, category?.id);
    const notifiedTicket = await notifyTicketAssignees(strapi, ticket.id);
    const responseTicket = notifiedTicket || ticketWithAssignees || ticket;

    ctx.body = {
      data: {
        ticketNumber: responseTicket.ticketNumber,
        id: responseTicket.id,
        documentId: responseTicket.documentId,
        categoryId: category?.id || null,
        serviceGroupId,
      },
    };
  },

  async legacyPublicCategories(ctx) {
    const serviceGroups = (await strapi.entityService.findMany(
      'api::service-group.service-group',
      {
        populate: ['categories', 'department'],
        sort: { name_ru: 'asc' } as any,
      }
    )) as any[];

    const result = (serviceGroups || []).map((sg: any) => ({
      id: sg.id,
      documentId: sg.documentId,
      name_ru: sg.name_ru,
      name_kz: sg.name_kz,
      slug: sg.slug,
      categories: (sg.categories || [])
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((cat: any) => ({
          id: cat.id,
          documentId: cat.documentId,
          name_ru: cat.name_ru,
          name_kz: cat.name_kz,
          slug: cat.slug,
          order: cat.order,
        })),
    }));

    ctx.body = { data: result };
  },

  async reassign(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const { id } = ctx.params;
    const body = ctx.request.body as any;
    const targetDepartmentId = Number(body?.departmentId || body?.targetDepartmentId || 0);
    const transferReason = String(body?.reason || body?.transferReason || '').trim();
    const rawAssigneeIds = Array.isArray(body?.assigneeIds)
      ? body.assigneeIds
      : body?.assigneeId !== undefined
      ? [body.assigneeId]
      : [];
    const assigneeIds = rawAssigneeIds
      .map((value: any) => parseInt(value, 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    const ticketRow = await getTicketByDocumentId(strapi, id);
    if (!ticketRow?.id) {
      ctx.throw(404, 'Ticket not found');
      return;
    }
    if (!userCanReassignTicket(userWithDept, ticketRow, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const isHelpdeskHead = isKuatHelpdeskHead(userWithDept);
    const ticketDepartmentKey = ticketRow?.targetDepartment?.key || ticketRow?.serviceGroup?.department?.key;

    if (targetDepartmentId > 0) {
      if (!userCanTransferBetweenDepartments(userWithDept, isSuperAdmin)) {
        ctx.throw(403, 'Only department heads and HelpDesk admins can transfer tickets between departments');
        return;
      }

      if (!transferReason) {
        ctx.throw(400, 'Transfer reason is required');
        return;
      }

      const department = (await strapi.entityService.findOne(
        'api::department.department',
        targetDepartmentId
      )) as any;

      if (!department?.id || !HELP_SERVICE_DEPARTMENT_KEYS.includes(department.key)) {
        ctx.throw(400, 'Target department must be IT, Medical Equipment or Engineering');
        return;
      }

      if (department.key === ticketDepartmentKey) {
        ctx.throw(400, 'Ticket is already routed to this department');
        return;
      }

      const nextGroup = await findServiceGroupByDepartmentKey(strapi, department.key);
      if (!nextGroup?.id) {
        ctx.throw(400, 'Target department has no HelpDesk service group');
        return;
      }

      const updateData: any = {
        targetDepartment: department.id,
        transferReason,
        assignee: { set: [] },
        serviceGroup: nextGroup.id,
        category: null,
        householdExecutor: null,
        status: ticketRow.status === 'DONE' ? ticketRow.status : 'NEW',
      };
      const initialComplexity = getInitialComplexityForDepartment(department);
      if (initialComplexity) {
        updateData.complexity = initialComplexity;
      }

      const ticket = (await strapi.entityService.update('api::ticket.ticket', ticketRow.id, {
        data: updateData,
        populate: TICKET_POPULATE,
      })) as any;
      await notifyTicketDepartmentOwners(strapi, ticket, department, transferReason);
      await publishTicketRealtime(strapi, ticket, 'tickets:transferred');
      await createAuditEvent(strapi, {
        action: 'ticket.transfer_department',
        entityType: TICKET_UID,
        entityId: ticket.id,
        actor: Number(user.id),
        oldData: {
          targetDepartment: formatDepartmentForClient(ticketRow.targetDepartment || ticketRow.serviceGroup?.department),
          assigneeIds: extractRelationIds(ticketRow.assignee),
          serviceGroupId: ticketRow.serviceGroup?.id || null,
          categoryId: ticketRow.category?.id || null,
          status: ticketRow.status || null,
        },
        newData: {
          targetDepartment: formatDepartmentForClient(department),
          assigneeIds: [],
          serviceGroupId: nextGroup.id,
          categoryId: null,
          status: ticket.status || null,
          reason: transferReason,
        },
      });

      const normalizedTicket = await (this as any).formatTicketForClient(ticket);
      ctx.body = { data: normalizedTicket };
      return;
    }

    if (assigneeIds.length === 0) {
      ctx.throw(400, 'assigneeIds or departmentId is required');
      return;
    }

    const uniqueAssigneeIds = Array.from(new Set(assigneeIds));
    const assignees = (await strapi.entityService.findMany(
      'plugin::users-permissions.user',
      {
        filters: { id: { $in: uniqueAssigneeIds } } as any,
        fields: ['id', 'username', 'email', 'firstName', 'lastName'],
        populate: ['department'],
      }
    )) as any[];
    if (assignees.length !== uniqueAssigneeIds.length) {
      ctx.throw(400, 'User not found');
      return;
    }

    const invalidAssignee = assignees.find(
      (assignee: any) => !HELP_SERVICE_DEPARTMENT_KEYS.includes(assignee?.department?.key)
    );
    if (invalidAssignee) {
      ctx.throw(400, 'Assignee must belong to IT, Medical Equipment or Engineering');
      return;
    }

    const nextDeptKeys = Array.from(
      new Set(assignees.map((assignee: any) => assignee?.department?.key).filter(Boolean))
    );
    const actorDeptKey = userWithDept?.department?.key;

    if (!isSuperAdmin && !isHelpdeskHead) {
      const outsideOwnDepartment = nextDeptKeys.some((key) => key !== actorDeptKey);
      if (outsideOwnDepartment) {
        ctx.throw(400, 'Use department transfer to route tickets outside your department');
        return;
      }
    }

    const updateData: any = {
      assignee: {
        set: uniqueAssigneeIds.map((assigneeId) => ({ id: assigneeId })),
      },
    };

    if (nextDeptKeys.length === 1 && nextDeptKeys[0] !== ticketRow?.serviceGroup?.department?.key) {
      const nextGroup = await findServiceGroupByDepartmentKey(strapi, nextDeptKeys[0]);
      if (nextGroup?.id) {
        updateData.serviceGroup = nextGroup.id;
        updateData.category = null;
      }
    }
    if (nextDeptKeys.length === 1) {
      updateData.targetDepartment = assignees[0].department.id;
      updateData.transferReason = null;
      const movedIntoIt =
        nextDeptKeys[0] === 'IT' &&
        nextDeptKeys[0] !== (ticketRow?.targetDepartment?.key || ticketRow?.serviceGroup?.department?.key);
      if (movedIntoIt) {
        updateData.complexity = 'C';
      }
    }

    const ticket = (await strapi.entityService.update('api::ticket.ticket', ticketRow.id, {
      data: updateData,
      populate: TICKET_POPULATE,
    })) as any;
    await publishTicketRealtime(strapi, ticket, 'tickets:reassigned');
    await createAuditEvent(strapi, {
      action: 'ticket.reassign_users',
      entityType: TICKET_UID,
      entityId: ticket.id,
      actor: Number(user.id),
      oldData: {
        targetDepartment: formatDepartmentForClient(ticketRow.targetDepartment || ticketRow.serviceGroup?.department),
        assigneeIds: extractRelationIds(ticketRow.assignee),
      },
      newData: {
        targetDepartment: formatDepartmentForClient(ticket.targetDepartment),
        assigneeIds: uniqueAssigneeIds,
      },
    });

    const normalizedTicket = await (this as any).formatTicketForClient(ticket);
    ctx.body = { data: normalizedTicket };
  },

  async householdExecutors(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!userCanManageHouseholdExecutors(userWithDept, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const includeInactive = ctx.query?.includeInactive === 'true' || ctx.query?.includeInactive === true;
    const executors = (await strapi.entityService.findMany(HOUSEHOLD_EXECUTOR_UID as any, {
      filters: includeInactive ? {} : { active: true },
      sort: [{ sortOrder: 'asc' }, { name: 'asc' }] as any,
      pagination: { pageSize: 1000 },
    })) as any[];

    ctx.body = { data: (executors || []).map(formatHouseholdExecutorForClient) };
  },

  async createHouseholdExecutor(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!userCanManageHouseholdExecutors(userWithDept, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const input = ctx.request.body?.data || ctx.request.body || {};
    const name = String(input.name || '').trim();
    const sortOrder = Number(input.sortOrder || 0);
    if (!name) {
      ctx.throw(400, 'Executor name is required');
      return;
    }

    const duplicates = (await strapi.entityService.findMany(HOUSEHOLD_EXECUTOR_UID as any, {
      filters: { name: { $eqi: name } } as any,
      limit: 1,
    })) as any[];
    const duplicate = duplicates?.[0];
    if (duplicate?.id) {
      if (duplicate.active !== false) {
        ctx.throw(400, 'Исполнитель с таким именем уже есть в списке');
        return;
      }
      const reactivated = (await strapi.entityService.update(HOUSEHOLD_EXECUTOR_UID as any, duplicate.id, {
        data: { active: true },
      } as any)) as any;
      ctx.body = { data: formatHouseholdExecutorForClient(reactivated) };
      return;
    }

    const executor = (await strapi.entityService.create(HOUSEHOLD_EXECUTOR_UID as any, {
      data: {
        name,
        active: true,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    } as any)) as any;

    ctx.body = { data: formatHouseholdExecutorForClient(executor) };
  },

  async updateHouseholdExecutor(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!userCanManageHouseholdExecutors(userWithDept, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const executorId = Number(ctx.params.executorId);
    if (!Number.isFinite(executorId) || executorId <= 0) {
      ctx.throw(400, 'Invalid executor id');
      return;
    }

    const input = ctx.request.body?.data || ctx.request.body || {};
    const data: any = {};
    if (input.name !== undefined) {
      const name = String(input.name || '').trim();
      if (!name) {
        ctx.throw(400, 'Executor name is required');
        return;
      }
      const duplicates = (await strapi.entityService.findMany(HOUSEHOLD_EXECUTOR_UID as any, {
        filters: { name: { $eqi: name }, id: { $ne: executorId } } as any,
        limit: 1,
      })) as any[];
      if (duplicates?.[0]?.id) {
        ctx.throw(400, 'Исполнитель с таким именем уже есть в списке');
        return;
      }
      data.name = name;
    }
    if (input.sortOrder !== undefined) {
      const sortOrder = Number(input.sortOrder);
      data.sortOrder = Number.isFinite(sortOrder) ? sortOrder : 0;
    }
    if (input.active !== undefined) {
      data.active = input.active !== false;
    }

    const executor = (await strapi.entityService.update(HOUSEHOLD_EXECUTOR_UID as any, executorId, {
      data,
    } as any)) as any;
    ctx.body = { data: formatHouseholdExecutorForClient(executor) };
  },

  async deleteHouseholdExecutor(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!userCanManageHouseholdExecutors(userWithDept, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const executorId = Number(ctx.params.executorId);
    if (!Number.isFinite(executorId) || executorId <= 0) {
      ctx.throw(400, 'Invalid executor id');
      return;
    }

    const executor = (await strapi.entityService.update(HOUSEHOLD_EXECUTOR_UID as any, executorId, {
      data: { active: false },
    } as any)) as any;
    ctx.body = { data: formatHouseholdExecutorForClient(executor) };
  },

  async assignHouseholdExecutor(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;
    const { isSuperAdmin } = getUserFlags(userWithDept);
    if (!userCanManageHouseholdExecutors(userWithDept, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const ticketRow = await getTicketByDocumentId(strapi, ctx.params.id);
    if (!ticketRow?.id) {
      ctx.throw(404, 'Ticket not found');
      return;
    }

    const ticketDepartmentKey = ticketRow?.targetDepartment?.key || ticketRow?.serviceGroup?.department?.key;
    if (ticketDepartmentKey !== 'ENGINEERING') {
      ctx.throw(400, 'Household executors are available only for Engineering tickets');
      return;
    }

    if (!userCanManageTicket(userWithDept, ticketRow, isSuperAdmin)) {
      ctx.throw(403, 'Forbidden');
      return;
    }

    const input = ctx.request.body?.data || ctx.request.body || {};
    const rawExecutorId = input.householdExecutorId !== undefined ? input.householdExecutorId : input.executorId;
    const isUnassign =
      rawExecutorId === undefined || rawExecutorId === null || rawExecutorId === '' || rawExecutorId === 0 || rawExecutorId === '0';
    const executorId = Number(rawExecutorId);
    if (!isUnassign && (!Number.isInteger(executorId) || executorId <= 0)) {
      ctx.throw(400, 'Invalid executor id');
      return;
    }

    if (!isUnassign) {
      const executor = (await strapi.entityService.findOne(HOUSEHOLD_EXECUTOR_UID as any, executorId)) as any;
      if (!executor?.id || executor.active === false) {
        ctx.throw(400, 'Executor not found');
        return;
      }
      await strapi.entityService.update('api::ticket.ticket', ticketRow.id, {
        data: { householdExecutor: executor.id } as any,
      });
      // Conditional flip so a concurrent DONE/INVALID is never overwritten
      await strapi.db.query(TICKET_UID).update({
        where: { id: ticketRow.id, status: 'NEW' },
        data: { status: 'IN_PROGRESS' },
      });
    } else {
      await strapi.entityService.update('api::ticket.ticket', ticketRow.id, {
        data: { householdExecutor: null } as any,
      });
      await strapi.db.query(TICKET_UID).update({
        where: { id: ticketRow.id, status: 'IN_PROGRESS' },
        data: { status: 'NEW' },
      });
    }

    const ticket = (await strapi.entityService.findOne('api::ticket.ticket', ticketRow.id, {
      populate: TICKET_POPULATE,
    })) as any;
    await publishTicketRealtime(strapi, ticket, 'tickets:household_executor_changed');
    await createAuditEvent(strapi, {
      action: 'ticket.assign_household_executor',
      entityType: TICKET_UID,
      entityId: ticket.id,
      actor: Number(user.id),
      oldData: {
        householdExecutorId: ticketRow.householdExecutor?.id || null,
        status: ticketRow.status || null,
      },
      newData: {
        householdExecutorId: ticket.householdExecutor?.id || null,
        status: ticket.status || null,
      },
    });

    const normalizedTicket = await (this as any).formatTicketForClient(ticket);
    ctx.body = { data: normalizedTicket };
  },

  async assignableUsers(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department', 'role'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const deptKey = userWithDept?.department?.key;
    const canUseServicePool =
      isSuperAdmin ||
      isKuatHelpdeskHead(userWithDept) ||
      userWithDept?.department?.canManageTickets === true ||
      (typeof deptKey === 'string' && HELP_SERVICE_DEPARTMENT_KEYS.includes(deptKey));

    if (!canUseServicePool) {
      ctx.body = { data: [] };
      return;
    }

    const filters: any = {
      department: { key: { $in: HELP_SERVICE_DEPARTMENT_KEYS } },
      blocked: false,
    };

    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters,
      populate: ['department'],
      sort: { firstName: 'asc', lastName: 'asc', username: 'asc' } as any,
    })) as any[];

    const sanitized = (users || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      department: u.department
        ? {
            id: u.department.id,
            key: u.department.key,
            name_ru: u.department.name_ru,
            name_kz: u.department.name_kz,
          }
        : null,
    }));

    ctx.body = { data: sanitized };
  },
}));
