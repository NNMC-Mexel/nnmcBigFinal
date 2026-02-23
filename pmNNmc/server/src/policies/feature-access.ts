import { getRoleFlags } from '../utils/project-assignments';

type FeatureKey = 'dashboard' | 'projects' | 'helpdesk';

const resolveFeatureFlag = (value: unknown, fallback = true) =>
  typeof value === 'boolean' ? value : fallback;

export default async (policyContext: any, config: { feature?: FeatureKey } = {}) => {
  const strapi = (global as any).strapi;
  const user = policyContext.state.user;

  if (!user) {
    return false;
  }

  const feature = config.feature;
  if (!feature) {
    return true;
  }

  const userWithRole = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    user.id,
    { populate: ['role', 'department'] }
  )) as any;

  const { isAdmin, isSuperAdmin } = getRoleFlags(userWithRole?.role);
  const departmentKey = userWithRole?.department?.key || null;

  const projectDepartments = ['IT', 'DIGITALIZATION'];
  const helpdeskDepartments = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];

  if (feature === 'dashboard') {
    const hasFeature = resolveFeatureFlag(userWithRole?.canViewDashboard, true);
    const hasDepartmentAccess = isSuperAdmin || isAdmin || projectDepartments.includes(departmentKey);
    if (!hasFeature || !hasDepartmentAccess) {
      policyContext.throw(403, 'Dashboard access denied');
      return false;
    }
  }

  if (feature === 'projects') {
    const canViewBoard = resolveFeatureFlag(userWithRole?.canViewBoard, true);
    const canViewTable = resolveFeatureFlag(userWithRole?.canViewTable, true);
    const hasFeature = canViewBoard || canViewTable;
    const hasDepartmentAccess = isSuperAdmin || isAdmin || projectDepartments.includes(departmentKey);
    if (!hasFeature || !hasDepartmentAccess) {
      policyContext.throw(403, 'Projects access denied');
      return false;
    }
  }

  if (feature === 'helpdesk') {
    const hasFeature = resolveFeatureFlag(userWithRole?.canViewHelpdesk, true);
    const hasDepartmentAccess = isSuperAdmin || isAdmin || helpdeskDepartments.includes(departmentKey);
    if (!hasFeature || !hasDepartmentAccess) {
      policyContext.throw(403, 'Helpdesk access denied');
      return false;
    }
  }

  return true;
};
