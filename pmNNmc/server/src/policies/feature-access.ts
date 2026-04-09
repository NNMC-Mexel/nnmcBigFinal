import { getUserFlags } from '../utils/project-assignments';

type FeatureKey = 'dashboard' | 'projects' | 'helpdesk';

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

  const userWithDept = (await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    user.id,
    { populate: ['department'] }
  )) as any;

  const { isSuperAdmin } = getUserFlags(userWithDept);

  // SuperAdmins always have access
  if (isSuperAdmin) {
    return true;
  }

  const dept = userWithDept?.department;

  if (feature === 'dashboard') {
    return dept?.canViewDashboard === true;
  }

  if (feature === 'projects') {
    const allowed = dept?.canViewBoard === true || dept?.canViewTable === true;
    if (!allowed) {
      console.log('[feature-access] DENIED projects for user', user.id, 'dept:', dept?.key,
        'canViewBoard:', dept?.canViewBoard, 'canViewTable:', dept?.canViewTable);
    }
    return allowed;
  }

  if (feature === 'helpdesk') {
    return dept?.canViewHelpdesk === true;
  }

  return true;
};
