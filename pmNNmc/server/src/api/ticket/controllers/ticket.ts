import { factories } from '@strapi/strapi';
import { getUserFlags } from '../../../utils/project-assignments';

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

async function notifyTicketAssignees(strapi: any, ticketId: number) {
  try {
    const ticket = (await strapi.entityService.findOne('api::ticket.ticket', ticketId, {
      populate: ['assignee', 'category', 'serviceGroup'],
    })) as any;
    if (!ticket) return null;

    const assigneeIds = Array.from(new Set(extractRelationIds(ticket.assignee)));
    if (assigneeIds.length === 0) return ticket;

    const categoryName = ticket.category?.name_ru || ticket.category?.name_kz || 'Заявка';
    const body = String(ticket.comment || '').trim();
    await Promise.all(
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

    return ticket;
  } catch (error: any) {
    strapi.log.warn(`[tickets] Could not notify ticket assignees: ${error?.message || error}`);
    return null;
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
          firstName: assignee.firstName,
          lastName: assignee.lastName,
        });
        continue;
      }

      const fullUser = (await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        assigneeId,
        {
          fields: ['id', 'username', 'firstName', 'lastName'],
        }
      )) as any;

      if (fullUser) {
        result.push({
          id: fullUser.id,
          username: fullUser.username,
          firstName: fullUser.firstName,
          lastName: fullUser.lastName,
        });
      }
    }

    return result;
  },

  async formatTicketForClient(ticket: any) {
    if (!ticket) return ticket;
    return {
      ...ticket,
      assignee: await (this as any).formatAssigneesForClient(ticket.assignee),
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
    const assigneeId = query.assigneeId ? parseInt(query.assigneeId) : undefined;
    const status = query.status as string | undefined;
    const search = query.search as string | undefined;
    const page = parseInt(query.page) || 1;
    const pageSize = parseInt(query.pageSize) || 100;

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const dept = userWithDept?.department;
    const canManageTickets = isSuperAdmin || dept?.canManageTickets === true;

    const filters: any = {};

    if (status && status !== 'ALL') {
      filters.status = status;
    }

    if (search) {
      filters.$or = [
        { requesterName: { $containsi: search } },
        { ticketNumber: { $containsi: search } },
        { requesterDepartment: { $containsi: search } },
      ];
    }

    if (!isSuperAdmin) {
      const deptKey = dept?.key;

      if (!deptKey) {
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize, pageCount: 0 } } };
        return;
      }

      const serviceGroups = (await strapi.entityService.findMany(
        'api::service-group.service-group',
        {
          filters: { department: { key: deptKey } } as any,
          populate: ['department'],
        }
      )) as any[];

      if (!serviceGroups || serviceGroups.length === 0) {
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize, pageCount: 0 } } };
        return;
      }

      const sgIds = serviceGroups.map((sg: any) => sg.id);
      filters.serviceGroup = { id: { $in: sgIds } };

      if (!canManageTickets) {
        filters.assignee = { id: user.id };
      } else {
        if (myTicketsOnly) {
          filters.assignee = { id: user.id };
        } else if (assigneeId) {
          filters.assignee = { id: assigneeId };
        }
      }
    } else {
      if (myTicketsOnly) {
        filters.assignee = { id: user.id };
      } else if (assigneeId) {
        filters.assignee = { id: assigneeId };
      }
    }

    const [tickets, total] = await Promise.all([
      strapi.entityService.findMany('api::ticket.ticket', {
        filters,
        populate: ['category', 'serviceGroup', 'assignee'],
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

  async find(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const dept = userWithDept?.department;
    const canManageTickets = isSuperAdmin || dept?.canManageTickets === true;

    const myTicketsOnly = ctx.query.myTickets === 'true' || ctx.query.myTickets === true;
    const assigneeFilter = ctx.query.assigneeId as string | undefined;
    const queryFilters = ctx.query.filters as any || {};

    delete ctx.query.myTickets;
    delete ctx.query.assigneeId;

    if (!isSuperAdmin) {
      const deptKey = dept?.key;
      if (!deptKey) {
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize: 25, pageCount: 0 } } };
        return;
      }

      const serviceGroups = (await strapi.entityService.findMany(
        'api::service-group.service-group',
        { filters: { department: { key: deptKey } } as any }
      )) as any[];

      if (!serviceGroups || serviceGroups.length === 0) {
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize: 25, pageCount: 0 } } };
        return;
      }

      const sgIds = serviceGroups.map((sg: any) => sg.id);

      const filters: any = {
        ...queryFilters,
        serviceGroup: { id: { $in: sgIds } },
      };

      if (!canManageTickets) {
        if (myTicketsOnly || !assigneeFilter) {
          filters.assignee = { id: user.id };
        }
      }

      if (assigneeFilter && canManageTickets) {
        filters.assignee = { id: parseInt(assigneeFilter) };
      }

      ctx.query.filters = filters;
    } else {
      if (assigneeFilter) {
        ctx.query.filters = {
          ...queryFilters,
          assignee: { id: parseInt(assigneeFilter) },
        };
      } else if (myTicketsOnly) {
        ctx.query.filters = {
          ...queryFilters,
          assignee: { id: user.id },
        };
      }
    }

    return await super.find(ctx);
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
      { populate: ['department'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const dept = userWithDept?.department;
    const canManageTickets = isSuperAdmin || dept?.canManageTickets === true;

    const filters: any = { documentId: id };

    if (!isSuperAdmin) {
      const deptKey = dept?.key;
      if (!deptKey) {
        ctx.throw(404, 'Ticket not found');
        return;
      }

      const serviceGroups = (await strapi.entityService.findMany(
        'api::service-group.service-group',
        { filters: { department: { key: deptKey } } as any }
      )) as any[];

      const sgIds = (serviceGroups || []).map((sg: any) => sg.id);
      if (sgIds.length === 0) {
        ctx.throw(404, 'Ticket not found');
        return;
      }

      filters.serviceGroup = { id: { $in: sgIds } };

      if (!canManageTickets) {
        filters.assignee = { id: user.id };
      }
    }

    const tickets = (await strapi.entityService.findMany('api::ticket.ticket', {
      filters,
      populate: ['category', 'serviceGroup', 'assignee'],
      limit: 1,
    })) as any[];

    const ticket = tickets?.[0];
    if (!ticket) {
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

    const data = ctx.request.body?.data || {};
    const nextStatus = data.status;

    if (nextStatus === 'IN_PROGRESS') {
      const existing = (await strapi.entityService.findMany('api::ticket.ticket', {
        filters: { documentId: ctx.params.id } as any,
        populate: ['assignee'],
        limit: 1,
      })) as any[];
      const ticket = existing?.[0];
      const assigneeIds = extractRelationIds(ticket?.assignee);
      if (ticket?.status === 'NEW' && assigneeIds.includes(Number(user.id))) {
        data.assignee = {
          set: [{ id: Number(user.id) }],
        };
      }
    }

    const result: any = await super.update(ctx);
    const normalizedTicket = await (this as any).formatTicketForClient(result?.data || result);
    ctx.body = { data: normalizedTicket };
  },

  async submit(ctx) {
    const user = ctx.state.user;
    if (!user) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const body = ctx.request.body as any;
    const { requesterName, requesterPhone, requesterDepartment, comment, categoryId, serviceGroupId } = body;

    if (!comment || !serviceGroupId) {
      ctx.throw(400, 'Обязательные поля: comment, serviceGroupId');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['department'] }
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

    if (serviceGroup.slug !== 'it-support' && serviceGroup.department?.key !== 'IT') {
      ctx.throw(400, 'Доступна подача только в IT службу');
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

    const ticketData: any = {
      requesterName: String(requesterName || getUserDisplayName(userWithDept)).trim(),
      requesterPhone: requesterPhone || null,
      requesterDepartment:
        String(requesterDepartment || userWithDept?.department?.name_ru || userWithDept?.department?.name_kz || '').trim() ||
        'Не указан',
      comment,
      serviceGroup: serviceGroup.id,
      status: 'NEW',
      ticketNumber: 'TEMP',
    };

    if (finalCategoryId) {
      ticketData.category = finalCategoryId;
    }

    const ticket = (await strapi.entityService.create('api::ticket.ticket', {
      data: ticketData,
    })) as any;
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
        filters: { slug: 'it-support' } as any,
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
    const body = ctx.request.body as any;
    const { requesterName, requesterPhone, requesterDepartment, comment, categoryId, serviceGroupId } = body;

    if (!requesterName || !comment || !serviceGroupId || !requesterDepartment) {
      ctx.throw(400, 'Обязательные поля: requesterName, requesterDepartment, comment, serviceGroupId');
      return;
    }

    const serviceGroup = await strapi.entityService.findOne(
      'api::service-group.service-group',
      serviceGroupId
    );
    if (!serviceGroup) {
      ctx.throw(400, 'Служба не найдена');
      return;
    }

    const ticketData: any = {
      requesterName,
      requesterPhone: requesterPhone || null,
      requesterDepartment,
      comment,
      serviceGroup: serviceGroupId,
      status: 'NEW',
      ticketNumber: 'TEMP',
    };

    if (categoryId) {
      ticketData.category = categoryId;
    }

    const ticket = (await strapi.entityService.create('api::ticket.ticket', {
      data: ticketData,
    })) as any;

    ctx.body = {
      data: {
        ticketNumber: ticket.ticketNumber,
        id: ticket.id,
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
    const rawAssigneeIds = Array.isArray(body?.assigneeIds)
      ? body.assigneeIds
      : body?.assigneeId !== undefined
      ? [body.assigneeId]
      : [];
    const assigneeIds = rawAssigneeIds
      .map((value: any) => parseInt(value, 10))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    if (assigneeIds.length === 0) {
      ctx.throw(400, 'assigneeIds is required');
      return;
    }

    const uniqueAssigneeIds = Array.from(new Set(assigneeIds));
    const assignees = (await strapi.entityService.findMany(
      'plugin::users-permissions.user',
      {
        filters: { id: { $in: uniqueAssigneeIds } } as any,
        fields: ['id'],
      }
    )) as any[];
    if (assignees.length !== uniqueAssigneeIds.length) {
      ctx.throw(400, 'Пользователь не найден');
      return;
    }

    const existing = (await strapi.entityService.findMany('api::ticket.ticket', {
      filters: { documentId: id } as any,
      fields: ['id'],
      limit: 1,
    })) as any[];

    const ticketRow = existing?.[0];
    if (!ticketRow?.id) {
      ctx.throw(404, 'Ticket not found');
      return;
    }

    const ticket = (await strapi.entityService.update('api::ticket.ticket', ticketRow.id, {
      data: {
        assignee: {
          set: uniqueAssigneeIds.map((assigneeId) => ({ id: assigneeId })),
        },
      } as any,
      populate: ['assignee', 'category', 'serviceGroup'],
    })) as any;

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
      { populate: ['department'] }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const deptKey = userWithDept?.department?.key;

    const filters: any = {};

    if (!isSuperAdmin && deptKey) {
      filters.department = { key: deptKey };
    }

    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters,
      populate: ['department'],
      sort: { firstName: 'asc', lastName: 'asc', username: 'asc' } as any,
    })) as any[];

    const sanitized = (users || []).map((u: any) => ({
      id: u.id,
      username: u.username,
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
