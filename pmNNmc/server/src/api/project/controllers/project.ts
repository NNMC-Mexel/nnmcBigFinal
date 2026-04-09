import { factories } from '@strapi/strapi';
import { getAssignableUserFilters, getUserFlags } from '../../../utils/project-assignments';
import { computeProjectProgressFromTasks } from '../../../utils/task-workflow';

async function checkSuperAdmin(
  ctx: any,
  strapi: any,
  options: { throwOnFail?: boolean } = {}
): Promise<boolean> {
  const throwOnFail = options.throwOnFail !== false;
  const user = ctx.state.user;
  if (!user) {
    if (throwOnFail) {
      ctx.throw(401, 'Not authenticated');
    }
    return false;
  }

  const fullUser = (await strapi.entityService.findOne('plugin::users-permissions.user', user.id, {
    fields: ['isSuperAdmin'],
  })) as any;

  const { isSuperAdmin } = getUserFlags(fullUser);

  if (!isSuperAdmin) {
    if (throwOnFail) {
      ctx.throw(403, 'Access denied. Only SuperAdmin can delete projects.');
    }
    return false;
  }

  return true;
}

export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  // Custom create — bypass REST API sanitizer that rejects relation fields
  async create(ctx) {
    const data = ctx.request.body?.data || {};

    const entry = await strapi.entityService.create('api::project.project', {
      data: {
        title: data.title,
        description: data.description || null,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        priorityLight: data.priorityLight || 'GREEN',
        status: data.status || 'ACTIVE',
        department: data.department || null,
        owner: data.owner || null,
        supportingSpecialists: data.supportingSpecialists || [],
        responsibleUsers: data.responsibleUsers || [],
        manualStageOverride: data.manualStageOverride || null,
      },
      populate: ['department', 'owner', 'supportingSpecialists', 'responsibleUsers', 'tasks', 'manualStageOverride'],
    });

    ctx.body = { data: enrichProjectWithComputedFields(entry) };
  },

  // Custom update — bypass REST API sanitizer
  async update(ctx) {
    const paramId = ctx.params.id;
    const data = ctx.request.body?.data || {};

    // Resolve documentId → numeric id if needed
    let numericId = Number(paramId);
    if (isNaN(numericId)) {
      const doc = await strapi.documents('api::project.project').findOne({
        documentId: paramId,
        fields: ['id'],
      }) as any;
      if (!doc) { ctx.throw(404, 'Project not found'); return; }
      numericId = doc.id;
    }

    // Build update payload with only the fields that were sent
    const updateData: Record<string, any> = {};
    const allowedScalars = ['title', 'description', 'startDate', 'dueDate', 'priorityLight', 'status'];
    for (const field of allowedScalars) {
      if (field in data) updateData[field] = data[field];
    }
    const allowedRelations = ['department', 'owner', 'supportingSpecialists', 'responsibleUsers', 'manualStageOverride'];
    for (const field of allowedRelations) {
      if (field in data) updateData[field] = data[field];
    }

    const entry = await strapi.entityService.update('api::project.project', numericId, {
      data: updateData,
      populate: ['department', 'owner', 'supportingSpecialists', 'responsibleUsers', 'tasks', 'tasks.assignee', 'manualStageOverride', 'meetings', 'meetings.author'],
    });

    ctx.body = { data: enrichProjectWithComputedFields(entry) };
  },

  async find(ctx) {
    const isSuperAdmin = await checkSuperAdmin(ctx, strapi, { throwOnFail: false });
    const { data, meta } = await super.find(ctx);
    const visibleData = isSuperAdmin
      ? data
      : data.filter((project: any) => project?.status !== 'DELETED');

    const enrichedData = await Promise.all(
      visibleData.map(async (project: any) => {
        return enrichProjectWithComputedFields(project);
      })
    );

    return { data: enrichedData, meta };
  },

  async findOne(ctx) {
    if (ctx.query.populate) {
      if (Array.isArray(ctx.query.populate)) {
        if (!ctx.query.populate.includes('meetings.author')) {
          ctx.query.populate.push('meetings.author');
        }
      } else if (typeof ctx.query.populate === 'object' && ctx.query.populate !== null) {
        const populateObj = ctx.query.populate as any;
        if (!populateObj.meetings) {
          populateObj.meetings = {};
        }
        if (typeof populateObj.meetings === 'object') {
          populateObj.meetings.populate = populateObj.meetings.populate || [];
          if (Array.isArray(populateObj.meetings.populate) && !populateObj.meetings.populate.includes('author')) {
            populateObj.meetings.populate.push('author');
          }
        }
      }
    }

    const response = await super.findOne(ctx);
    if (response?.data) {
      const isSuperAdmin = await checkSuperAdmin(ctx, strapi, { throwOnFail: false });
      if (!isSuperAdmin && response.data.status === 'DELETED') {
        ctx.throw(404, 'Project not found');
        return;
      }
      response.data = enrichProjectWithComputedFields(response.data);
    }
    return response;
  },

  async assignableUsers(ctx) {
    const currentUser = ctx.state.user;
    if (!currentUser) {
      ctx.throw(401, 'Not authenticated');
      return;
    }

    const userWithDept = (await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      currentUser.id,
      {
        populate: ['department'],
      }
    )) as any;

    const { isSuperAdmin } = getUserFlags(userWithDept);
    const requesterDepartmentKey = userWithDept?.department?.key ?? null;
    const requestedDepartmentKey = typeof ctx.query?.department === 'string' ? ctx.query.department : undefined;
    if (
      !isSuperAdmin &&
      requestedDepartmentKey &&
      requesterDepartmentKey &&
      requestedDepartmentKey !== requesterDepartmentKey
    ) {
      ctx.throw(403, 'You can request users only from your department');
      return;
    }
    const filters = getAssignableUserFilters({
      isSuperAdmin,
      requesterDepartmentKey,
      requestedDepartmentKey,
    });

    if (filters === null) {
      ctx.throw(403, 'User department is required');
      return;
    }

    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: { ...filters, blocked: false } as any,
      populate: ['department'],
      sort: { firstName: 'asc', lastName: 'asc', username: 'asc' },
    })) as any[];

    const sanitized = users.map((user: any) => ({
      id: user.id,
      username: user.username,
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
    }));

    ctx.body = { data: sanitized };
  },

  async delete(ctx) {
    await checkSuperAdmin(ctx, strapi);
    return await super.delete(ctx);
  },
}));

function enrichProjectWithComputedFields(project: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasks = project.tasks || [];
  const { progressPercent, doneTasks, totalTasks } = computeProjectProgressFromTasks(tasks);

  const dueDate = project.dueDate ? new Date(project.dueDate) : null;
  let overdue = false;
  let dueSoon = false;

  if (dueDate && project.status === 'ACTIVE') {
    dueDate.setHours(0, 0, 0, 0);
    overdue = today > dueDate;

    if (!overdue) {
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      dueSoon = diffDays <= 3 && diffDays >= 0;
    }
  }

  return {
    ...project,
    progressPercent,
    overdue,
    dueSoon,
    totalTasks,
    doneTasks,
  };
}
