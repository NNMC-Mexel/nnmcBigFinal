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
    { populate: ['role'] }
  )) as any;

  const { isAdmin, isSuperAdmin } = getRoleFlags(userWithRole?.role);

  // Admins and SuperAdmins always have access
  if (isSuperAdmin || isAdmin) {
    return true;
  }

  if (feature === 'dashboard') {
    return resolveFeatureFlag(userWithRole?.canViewDashboard, true);
  }

  if (feature === 'projects') {
    const canViewBoard = resolveFeatureFlag(userWithRole?.canViewBoard, true);
    const canViewTable = resolveFeatureFlag(userWithRole?.canViewTable, true);
    return canViewBoard || canViewTable;
  }

  if (feature === 'helpdesk') {
    return resolveFeatureFlag(userWithRole?.canViewHelpdesk, true);
  }

  return true;
};
