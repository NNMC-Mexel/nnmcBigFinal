import { factories } from '@strapi/strapi';

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

    // Parse query params directly
    const query = ctx.query as any;
    const myTicketsOnly = query.myTickets === 'true' || query.myTickets === true;
    const assigneeId = query.assigneeId ? parseInt(query.assigneeId) : undefined;
    const status = query.status as string | undefined;
    const search = query.search as string | undefined;
    const page = parseInt(query.page) || 1;
    const pageSize = parseInt(query.pageSize) || 100;

    // Get user info with role and department
    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['role', 'department'] }
    )) as any;

    const roleName = (userWithDept?.role?.name || '').toLowerCase().replace(/\s+/g, '');
    const roleType = (userWithDept?.role?.type || '').toLowerCase().replace(/\s+/g, '');
    const adminRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
    const leadRoles = ['lead', 'руководитель'];
    const isAdmin = adminRoles.some((r) => roleName.includes(r) || roleType.includes(r));
    const isLead = leadRoles.some((r) => roleName.includes(r) || roleType.includes(r));

    // Build filters
    const filters: any = {};

    // Status filter
    if (status && status !== 'ALL') {
      filters.status = status;
    }

    // Search filter
    if (search) {
      filters.$or = [
        { requesterName: { $containsi: search } },
        { ticketNumber: { $containsi: search } },
        { requesterDepartment: { $containsi: search } },
      ];
    }

    // Department-based filtering for non-admins
    if (!isAdmin) {
      const deptKey = userWithDept?.department?.key;
      console.log(`🎫 User ${user.id} dept=${deptKey}, isLead=${isLead}, myTicketsOnly=${myTicketsOnly}`);

      if (!deptKey) {
        console.log(`🎫 No department for user ${user.id}`);
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

      console.log(`🎫 Found ${serviceGroups?.length || 0} service groups for dept ${deptKey}:`, serviceGroups?.map((sg: any) => ({ id: sg.id, slug: sg.slug, deptKey: sg.department?.key })));

      if (!serviceGroups || serviceGroups.length === 0) {
        console.log(`🎫 No service groups found for dept ${deptKey}`);
        ctx.body = { data: [], meta: { pagination: { total: 0, page: 1, pageSize, pageCount: 0 } } };
        return;
      }

      const sgIds = serviceGroups.map((sg: any) => sg.id);
      filters.serviceGroup = { id: { $in: sgIds } };

      // Regular staff always see only their own tickets
      if (!isLead) {
        filters.assignee = { id: user.id };
      } else {
        // Lead can filter by assignee or see own tickets
        if (myTicketsOnly) {
          filters.assignee = { id: user.id };
        } else if (assigneeId) {
          filters.assignee = { id: assigneeId };
        }
        // If neither, lead sees all department tickets
      }
    } else {
      // Admin can see all, optionally filter
      if (myTicketsOnly) {
        filters.assignee = { id: user.id };
      } else if (assigneeId) {
        filters.assignee = { id: assigneeId };
      }
    }

    // Query tickets
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
      { populate: ['role', 'department'] }
    )) as any;

    const roleName = (userWithDept?.role?.name || '').toLowerCase().replace(/\s+/g, '');
    const roleType = (userWithDept?.role?.type || '').toLowerCase().replace(/\s+/g, '');
    const adminRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
    const leadRoles = ['lead', 'руководитель'];
    const isAdmin = adminRoles.some((r) => roleName.includes(r) || roleType.includes(r));
    const isLead = leadRoles.some((r) => roleName.includes(r) || roleType.includes(r));

    // Get custom query parameters (separate from Strapi filters)
    const myTicketsOnly = ctx.query.myTickets === 'true' || ctx.query.myTickets === true;
    const assigneeFilter = ctx.query.assigneeId as string | undefined;
    const queryFilters = ctx.query.filters as any || {};

    // Clean up custom params from query to avoid Strapi validation errors
    delete ctx.query.myTickets;
    delete ctx.query.assigneeId;

    if (!isAdmin) {
      const deptKey = userWithDept?.department?.key;
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

      // Base filter: service group must match department
      const filters: any = {
        ...queryFilters,
        serviceGroup: { id: { $in: sgIds } },
      };

      // If not lead/admin and myTicketsOnly is true (or by default for regular staff)
      // Regular staff see only their own tickets by default
      if (!isLead && !isAdmin) {
        if (myTicketsOnly || !assigneeFilter) {
          // Show only own tickets
          filters.assignee = { id: user.id };
        }
      }

      // If assignee filter is specified (lead viewing specific employee's tickets)
      if (assigneeFilter && (isLead || isAdmin)) {
        filters.assignee = { id: parseInt(assigneeFilter) };
      }

      ctx.query.filters = filters;
    } else {
      // Admin can see all tickets, optionally filter by assignee
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

    const { id } = ctx.params; // documentId in Strapi v5 routes

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      user.id,
      { populate: ['role', 'department'] }
    )) as any;

    const roleName = (userWithDept?.role?.name || '').toLowerCase().replace(/\s+/g, '');
    const roleType = (userWithDept?.role?.type || '').toLowerCase().replace(/\s+/g, '');
    const adminRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
    const leadRoles = ['lead', 'руководитель'];
    const isAdmin = adminRoles.some((r) => roleName.includes(r) || roleType.includes(r));
    const isLead = leadRoles.some((r) => roleName.includes(r) || roleType.includes(r));

    const filters: any = { documentId: id };

    if (!isAdmin) {
      const deptKey = userWithDept?.department?.key;
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

      // Regular staff can view only own tickets. Lead can view all in own department.
      if (!isLead) {
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

  async publicSubmit(ctx) {
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

  async publicCategories(ctx) {
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

    const finalAssigneeIds = (Array.isArray(ticket?.assignee) ? ticket.assignee : ticket?.assignee ? [ticket.assignee] : [])
      .map((item: any) => (typeof item === 'number' ? item : item?.id))
      .filter((id: number | undefined) => Boolean(id));
    console.log(
      `🎫 reassign ticket=${id} (${ticketRow.id}) requested=${JSON.stringify(uniqueAssigneeIds)} final=${JSON.stringify(finalAssigneeIds)}`
    );

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
      { populate: ['role', 'department'] }
    )) as any;

    const roleName = (userWithDept?.role?.name || '').toLowerCase().replace(/\s+/g, '');
    const roleType = (userWithDept?.role?.type || '').toLowerCase().replace(/\s+/g, '');
    const adminRoles = ['admin', 'superadmin', 'super_admin', 'суперадмин'];
    const isAdmin = adminRoles.some((r) => roleName.includes(r) || roleType.includes(r));

    const deptKey = userWithDept?.department?.key;
    console.log(`👥 assignableUsers: user=${user.id}, isAdmin=${isAdmin}, deptKey=${deptKey}`);

    // Don't filter by blocked field - it might not work correctly
    const filters: any = {};

    if (!isAdmin && deptKey) {
      filters.department = { key: deptKey };
    }

    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters,
      populate: ['department'],
      sort: { firstName: 'asc', lastName: 'asc', username: 'asc' } as any,
    })) as any[];

    console.log(`👥 Found ${users?.length || 0} users:`, users?.map((u: any) => ({ id: u.id, username: u.username, deptKey: u.department?.key })));

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
