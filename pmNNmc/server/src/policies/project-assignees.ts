import {
  extractIdsFromValue,
  getOwnerIds,
  getRoleFlags,
} from '../utils/project-assignments';

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

  const { isSuperAdmin, isAdmin, isLead } = getRoleFlags(userWithRole?.role);
  const canManageOwner = isSuperAdmin || isAdmin || isLead;
  const ownerIds = getOwnerIds(data);
  const hasOwnerField = Object.prototype.hasOwnProperty.call(data, 'owner');
  const isCreate = ctx.request?.method === 'POST';

  if (isCreate && ownerIds.length === 0) {
    ctx.throw(400, 'Project owner is required');
    return false;
  }

  if (hasOwnerField && !isCreate) {
    if (!canManageOwner) {
      ctx.throw(403, 'Only admin or lead can change project owner');
      return false;
    }
  }

  if (hasOwnerField && ownerIds.length === 0) {
    ctx.throw(400, 'Project owner is required');
    return false;
  }

  if (isSuperAdmin) {
    return true;
  }

  const requesterDepartmentKey = userWithRole?.department?.key ?? null;
  if (!requesterDepartmentKey) {
    ctx.throw(403, 'User department is required to assign project users');
    return false;
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
    ctx.throw(403, 'Project department is required to assign project users');
    return false;
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
    ctx.throw(400, 'Some assignees were not found');
    return false;
  }

  const invalidDepartment = assignees.some(
    (user: any) => user.department?.key !== projectDepartmentKey
  );
  if (invalidDepartment) {
    ctx.throw(403, 'You can assign users only from the project department');
    return false;
  }

  return true;
};
