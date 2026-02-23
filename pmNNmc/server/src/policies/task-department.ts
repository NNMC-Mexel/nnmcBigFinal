import { extractIdsFromValue, getRoleFlags } from '../utils/project-assignments';

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const resolveProjectIdFromValue = async (projectValue: unknown, strapi: any): Promise<number | null> => {
  if (!projectValue) return null;

  const extracted = extractIdsFromValue(projectValue)[0];
  if (extracted) return extracted;

  const numeric = parseNumericId(projectValue);
  if (numeric) return numeric;

  if (typeof projectValue === 'string') {
    try {
      const docProject = (await strapi.documents('api::project.project').findOne({
        documentId: projectValue,
        fields: ['id'],
      })) as any;
      return docProject?.id ?? null;
    } catch {
      return null;
    }
  }

  const projectObj = projectValue as any;
  if (projectObj?.documentId) {
    try {
      const docProject = (await strapi.documents('api::project.project').findOne({
        documentId: projectObj.documentId,
        fields: ['id'],
      })) as any;
      return docProject?.id ?? null;
    } catch {
      return null;
    }
  }

  if (projectObj?.connect) {
    const connectValue = Array.isArray(projectObj.connect) ? projectObj.connect[0] : projectObj.connect;
    return resolveProjectIdFromValue(connectValue, strapi);
  }

  return null;
};

const resolveTaskWithProject = async (taskParam: unknown, strapi: any) => {
  if (!taskParam) return null;

  const numericId = parseNumericId(taskParam);
  if (numericId) {
    return (await strapi.entityService.findOne('api::task.task', numericId, {
      populate: ['project', 'assignee'],
    })) as any;
  }

  if (typeof taskParam === 'string') {
    try {
      const docTask = (await strapi.documents('api::task.task').findOne({
        documentId: taskParam,
        populate: ['project', 'assignee'],
      })) as any;
      if (!docTask?.id) return docTask;
      return (await strapi.entityService.findOne('api::task.task', docTask.id, {
        populate: ['project', 'assignee'],
      })) as any;
    } catch {
      return null;
    }
  }

  return null;
};

export default async (policyContext: any, _config: any, { strapi }: any) => {
  const ctx = policyContext;
  const data = ctx.request?.body?.data || {};

  const currentUser = ctx.state.user;
  if (!currentUser) {
    ctx.throw(401, 'Not authenticated');
    return false;
  }

  const userWithRole = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    currentUser.id,
    {
      populate: ['role', 'department'],
    }
  )) as any;

  const { isSuperAdmin } = getRoleFlags(userWithRole?.role);
  if (isSuperAdmin) {
    return true;
  }

  const requesterDepartmentKey = userWithRole?.department?.key ?? null;
  if (!requesterDepartmentKey) {
    ctx.throw(403, 'User department is required');
    return false;
  }

  const isCreate = ctx.request?.method === 'POST';
  const existingTask =
    !isCreate && ctx.params?.id ? await resolveTaskWithProject(ctx.params.id, strapi) : null;

  const projectIdFromData = await resolveProjectIdFromValue(data.project, strapi);
  const projectId = projectIdFromData ?? existingTask?.project?.id ?? null;
  if (!projectId) {
    ctx.throw(400, 'Task project is required');
    return false;
  }

  const project = (await strapi.entityService.findOne('api::project.project', projectId, {
    populate: ['department'],
    fields: ['id'],
  })) as any;

  const projectDepartmentKey = project?.department?.key ?? null;
  if (!projectDepartmentKey) {
    ctx.throw(403, 'Project department is required');
    return false;
  }

  if (projectDepartmentKey !== requesterDepartmentKey) {
    ctx.throw(403, 'You can manage tasks only in your department projects');
    return false;
  }

  const assigneeIdsFromData = extractIdsFromValue(data.assignee);
  const assigneeId = assigneeIdsFromData[0] ?? existingTask?.assignee?.id ?? null;
  if (!assigneeId) {
    return true;
  }

  const assignee = (await strapi.entityService.findOne('plugin::users-permissions.user', assigneeId, {
    populate: ['department'],
    fields: ['id'],
  })) as any;
  if (!assignee) {
    ctx.throw(400, 'Assignee not found');
    return false;
  }

  if (assignee?.department?.key !== projectDepartmentKey) {
    ctx.throw(403, 'Assignee must be from the project department');
    return false;
  }

  return true;
};

