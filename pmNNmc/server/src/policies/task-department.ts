import { extractIdsFromValue, getUserFlags } from '../utils/project-assignments';

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

  const userWithDept = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    currentUser.id,
    {
      populate: ['department'],
    }
  )) as any;

  const { isSuperAdmin } = getUserFlags(userWithDept);
  if (isSuperAdmin) {
    return true;
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
    populate: ['department', 'owner', 'managers'],
  })) as any;

  // Allow if user is the project owner or a manager
  const isOwner = project?.owner?.id === currentUser.id;
  const isManager = Array.isArray(project?.managers) &&
    project.managers.some((m: any) => m.id === currentUser.id);

  if (isOwner || isManager) {
    return true;
  }

  // Otherwise, fall back to department-based check
  const requesterDepartmentKey = userWithDept?.department?.key ?? null;
  if (!requesterDepartmentKey) {
    ctx.throw(403, 'User department is required');
    return false;
  }

  const projectDepartmentKey = project?.department?.key ?? null;
  if (!projectDepartmentKey) {
    ctx.throw(403, 'Project department is required');
    return false;
  }

  if (projectDepartmentKey !== requesterDepartmentKey) {
    ctx.throw(403, 'You can manage tasks only in your department projects or projects where you are a manager');
    return false;
  }

  return true;
};
