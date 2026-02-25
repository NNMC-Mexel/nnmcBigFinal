import { errors } from '@strapi/utils';
import {
  extractIdsFromValue,
  getOwnerIds,
  getRoleFlags,
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

const resolveDepartmentKey = async (value: unknown, strapi: any): Promise<string | null> => {
  if (!value) return null;

  // Try numeric id first (what the frontend sends)
  const departmentId = extractIdsFromValue(value)[0] ?? parseNumericId(value);
  if (departmentId) {
    const department = (await strapi.entityService.findOne(
      'api::department.department',
      departmentId,
      { fields: ['key'] }
    )) as any;
    return department?.key ?? null;
  }

  if (typeof value === 'string') {
    // Fallback: treat as key or documentId
    const byKey = (await strapi.entityService.findMany('api::department.department', {
      filters: { key: value },
      fields: ['key'],
      pagination: { pageSize: 1 },
    })) as any[];
    if (byKey[0]?.key) return byKey[0].key;

    try {
      const byDocument = (await strapi
        .documents('api::department.department')
        .findOne({ documentId: value, fields: ['key'] })) as any;
      return byDocument?.key ?? null;
    } catch {
      return null;
    }
  }

  return null;
};

const resolveProjectForPolicy = async (projectParam: unknown, strapi: any) => {
  if (!projectParam) return null;

  const populate = ['department', 'owner', 'supportingSpecialists', 'responsibleUsers'];
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

export default async (policyContext: any, _config: any, { strapi }: any) => {
  const ctx = policyContext;
  const data = ctx.request?.body?.data || {};

  // Skip assignment validation for status-only updates (soft delete, archive, restore)
  const dataKeys = Object.keys(data);
  if (dataKeys.length === 1 && dataKeys[0] === 'status') {
    return true;
  }

  const currentUser = ctx.state.user;
  if (!currentUser) {
    throw new UnauthorizedError('Not authenticated');
  }

  const userWithRole = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    currentUser.id,
    {
      populate: ['role', 'department'],
    }
  )) as any;

  const { isSuperAdmin, isAdmin, isLead } = getRoleFlags(userWithRole?.role);
  const canManageOwner = isSuperAdmin || isAdmin || isLead;
  const ownerIds = getOwnerIds(data);
  const hasOwnerField = Object.prototype.hasOwnProperty.call(data, 'owner');
  const isCreate = ctx.request?.method === 'POST';

  if (isCreate && ownerIds.length === 0) {
    throw new ValidationError('Project owner is required');
  }

  if (hasOwnerField && !isCreate) {
    if (!canManageOwner) {
      throw new ForbiddenError('Only admin or lead can change project owner');
    }
  }

  if (hasOwnerField && ownerIds.length === 0) {
    throw new ValidationError('Project owner is required');
  }

  if (isSuperAdmin) {
    return true;
  }

  const requesterDepartmentKey = userWithRole?.department?.key ?? null;
  if (!requesterDepartmentKey) {
    throw new ForbiddenError('User department is required to assign project users');
  }

  const hasSupportingField = Object.prototype.hasOwnProperty.call(data, 'supportingSpecialists');
  const hasResponsibleField = Object.prototype.hasOwnProperty.call(data, 'responsibleUsers');
  const hasDepartmentField = Object.prototype.hasOwnProperty.call(data, 'department');

  const existingProject =
    !isCreate && ctx.params?.id
      ? await resolveProjectForPolicy(ctx.params.id, strapi)
      : null;

  const projectDepartmentKey =
    (await resolveDepartmentKey(data.department, strapi)) ||
    existingProject?.department?.key ||
    requesterDepartmentKey;

  if (!projectDepartmentKey) {
    throw new ForbiddenError('Project department is required to assign project users');
  }

  const ownerIdsForValidation = hasOwnerField
    ? ownerIds
    : extractIdsFromValue(existingProject?.owner?.id);
  const supportingIds = hasSupportingField
    ? extractIdsFromValue(data.supportingSpecialists)
    : extractIdsFromValue(existingProject?.supportingSpecialists?.map((u: any) => u.id));
  const responsibleIds = hasResponsibleField
    ? extractIdsFromValue(data.responsibleUsers)
    : extractIdsFromValue(existingProject?.responsibleUsers?.map((u: any) => u.id));

  const assigneeIds = Array.from(
    new Set<number>([...ownerIdsForValidation, ...supportingIds, ...responsibleIds])
  );

  // Validate all assignees when department changes or any assignee field is touched.
  if (assigneeIds.length === 0 && !hasDepartmentField) {
    return true;
  }

  const assignees = (await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: { id: { $in: assigneeIds } },
    populate: ['department'],
    fields: ['id'],
  })) as any[];

  const missingIds = assigneeIds.filter((id) => !assignees.some((user: any) => user.id === id));
  if (missingIds.length > 0) {
    throw new ValidationError('Some assignees were not found');
  }

  const invalidDepartment = assignees.some(
    (user: any) => user.department?.key !== projectDepartmentKey
  );
  if (invalidDepartment) {
    throw new ForbiddenError('You can assign users only from the project department');
  }

  return true;
};
