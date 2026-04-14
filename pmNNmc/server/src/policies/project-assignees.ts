import { errors } from '@strapi/utils';
import {
  extractIdsFromValue,
  getOwnerIds,
  getUserFlags,
} from '../utils/project-assignments';

const { UnauthorizedError, ForbiddenError, ValidationError } = errors;

const parseNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const resolveProjectForPolicy = async (projectParam: unknown, strapi: any) => {
  if (!projectParam) return null;

  const populate = ['department', 'owner', 'managers', 'supportingSpecialists', 'responsibleUsers'];
  const numericId = parseNumericId(projectParam);
  if (numericId) {
    return (await strapi.entityService.findOne('api::project.project', numericId, {
      populate,
    })) as any;
  }

  if (typeof projectParam === 'string') {
    try {
      const docProject = (await strapi.documents('api::project.project').findOne({
        documentId: projectParam,
        populate,
      })) as any;
      if (!docProject?.id) return docProject;
      return (await strapi.entityService.findOne('api::project.project', docProject.id, {
        populate,
      })) as any;
    } catch {
      return null;
    }
  }

  return null;
};

/**
 * Check if a user is the owner or one of the managers of a project.
 */
const isProjectManager = (userId: number, project: any): boolean => {
  if (project?.owner?.id === userId) return true;
  const managers = Array.isArray(project?.managers) ? project.managers : [];
  return managers.some((m: any) => m.id === userId);
};

export default async (policyContext: any, _config: any, { strapi }: any) => {
  const ctx = policyContext;
  const data = ctx.request?.body?.data || {};

  const currentUser = ctx.state.user;
  if (!currentUser) {
    throw new UnauthorizedError('Not authenticated');
  }

  const userWithDept = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    currentUser.id,
    { populate: ['department'] }
  )) as any;

  const { isSuperAdmin } = getUserFlags(userWithDept);

  // SuperAdmin bypasses all checks
  if (isSuperAdmin) {
    return true;
  }

  const method = ctx.request?.method;

  // --- READ (GET) --- allow all authenticated users
  if (method === 'GET') {
    return true;
  }

  // --- CREATE ---
  if (method === 'POST') {
    const ownerIds = getOwnerIds(data);
    if (ownerIds.length === 0) {
      throw new ValidationError('Project owner is required');
    }
    // Anyone with feature access (checked by feature-access policy) can create projects
    return true;
  }

  // --- UPDATE / DELETE ---
  const existingProject = ctx.params?.id
    ? await resolveProjectForPolicy(ctx.params.id, strapi)
    : null;

  if (!existingProject) {
    throw new ValidationError('Project not found');
  }

  // Check if current user is project owner or manager
  if (!isProjectManager(currentUser.id, existingProject)) {
    throw new ForbiddenError('Only project owner or managers can modify this project');
  }

  // Status-only updates: validate DELETED status requires canDeleteProject
  const dataKeys = Object.keys(data);
  if (dataKeys.length === 1 && dataKeys[0] === 'status' && data.status === 'DELETED') {
    if (!userWithDept?.department?.canDeleteProject) {
      throw new ForbiddenError('You do not have permission to delete projects');
    }
  }

  // Only owner can change the managers list
  const hasManagersField = Object.prototype.hasOwnProperty.call(data, 'managers');
  if (hasManagersField && existingProject?.owner?.id !== currentUser.id) {
    throw new ForbiddenError('Only the project owner can change the managers list');
  }

  // Only owner can change the owner field
  const hasOwnerField = Object.prototype.hasOwnProperty.call(data, 'owner');
  if (hasOwnerField) {
    const ownerIds = getOwnerIds(data);
    if (ownerIds.length === 0) {
      throw new ValidationError('Project owner is required');
    }
    if (existingProject?.owner?.id !== currentUser.id) {
      throw new ForbiddenError('Only the project owner can transfer ownership');
    }
  }

  // Validate that referenced users exist
  const allUserIds = new Set<number>();
  const ownerIds = getOwnerIds(data);
  ownerIds.forEach((id) => allUserIds.add(id));
  extractIdsFromValue(data.managers).forEach((id) => allUserIds.add(id));
  extractIdsFromValue(data.supportingSpecialists).forEach((id) => allUserIds.add(id));
  extractIdsFromValue(data.responsibleUsers).forEach((id) => allUserIds.add(id));

  if (allUserIds.size > 0) {
    const users = (await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: { id: { $in: Array.from(allUserIds) } },
      fields: ['id'],
    })) as any[];

    if (users.length !== allUserIds.size) {
      throw new ValidationError('Some referenced users were not found');
    }
  }

  return true;
};
