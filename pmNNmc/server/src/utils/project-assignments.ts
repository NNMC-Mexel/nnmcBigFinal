type RoleInfo = {
  name?: string | null;
  type?: string | null;
};

const normalizeRole = (value: string) =>
  value.toLowerCase().replace(/\s+/g, '').replace(/[_-]/g, '');

const roleHasToken = (role: RoleInfo | undefined, tokens: string[]) => {
  const roleName = normalizeRole(role?.name || '');
  const roleType = normalizeRole(role?.type || '');
  return tokens.some((token) => roleName.includes(token) || roleType.includes(token));
};

export const getRoleFlags = (role?: RoleInfo) => {
  const superAdminTokens = ['superadmin', 'суперадмин'];
  const adminTokens = ['admin', 'superadmin', 'суперадмин'];
  const leadTokens = ['lead', 'руководитель'];

  const isSuperAdmin = roleHasToken(role, superAdminTokens);
  const isAdmin = roleHasToken(role, adminTokens);
  const isLead = roleHasToken(role, leadTokens);

  return {
    isSuperAdmin,
    isAdmin,
    isLead,
  };
};

const parseId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

export const extractIdsFromValue = (value: unknown): number[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap(extractIdsFromValue);
  }

  const parsed = parseId(value);
  if (parsed !== null) {
    return [parsed];
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('id' in obj) return extractIdsFromValue(obj.id);
    if ('connect' in obj) return extractIdsFromValue(obj.connect);
    if ('set' in obj) return extractIdsFromValue(obj.set);
  }

  return [];
};

export const collectAssigneeIds = (data: Record<string, unknown>) => {
  const ids = new Set<number>();
  ['owner', 'supportingSpecialists', 'responsibleUsers'].forEach((field) => {
    extractIdsFromValue(data[field]).forEach((id) => ids.add(id));
  });
  return Array.from(ids);
};

export const getAssignableUserFilters = (options: {
  isSuperAdmin: boolean;
  requesterDepartmentKey?: string | null;
  requestedDepartmentKey?: string | null;
}) => {
  if (options.isSuperAdmin) {
    if (options.requestedDepartmentKey) {
      return { department: { key: options.requestedDepartmentKey } };
    }
    return {};
  }

  if (!options.requesterDepartmentKey) {
    return null;
  }

  const departmentKey = options.requestedDepartmentKey || options.requesterDepartmentKey;
  return { department: { key: departmentKey } };
};

export const getOwnerIds = (data: Record<string, unknown>) => extractIdsFromValue(data.owner);
