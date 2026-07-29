const HELPDESK_DEPARTMENT_KEYS = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];
const DEFAULT_MUTUAL_VISIBILITY_USERNAMES = ['ernar', 'zhandos'];

export interface HelpdeskVisibilityRule {
  viewerId: number;
  targetUserIds: number[];
}

export interface HelpdeskVisibilityScope {
  viewerUserId: number;
  categoryTargetUserIds: Record<string, number[]>;
  isConfigured: boolean;
}

function normalizeId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeUsername(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function relationItems(value: any): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeHelpdeskVisibilityRules(value: unknown): HelpdeskVisibilityRule[] {
  if (!Array.isArray(value)) return [];

  const rulesByViewer = new Map<number, Set<number>>();
  for (const item of value) {
    const viewerId = normalizeId(item?.viewerId);
    if (!viewerId) continue;

    const targetIds = rulesByViewer.get(viewerId) || new Set<number>();
    const rawTargets = Array.isArray(item?.targetUserIds) ? item.targetUserIds : [];
    for (const rawTarget of rawTargets) {
      const targetId = normalizeId(rawTarget);
      if (targetId && targetId !== viewerId) targetIds.add(targetId);
    }
    rulesByViewer.set(viewerId, targetIds);
  }

  return Array.from(rulesByViewer.entries()).map(([viewerId, targetIds]) => ({
    viewerId,
    targetUserIds: Array.from(targetIds),
  }));
}

/**
 * Existing installations receive a mutual Ernar/Zhandos rule for categories
 * assigned to either of them. Once the admin saves a category, even an empty
 * JSON array is treated as an explicit configuration and the fallback stops.
 */
export function resolveHelpdeskCategoryVisibilityRules(
  category: any,
  availableUsers: any[] = []
): HelpdeskVisibilityRule[] {
  if (Array.isArray(category?.visibilityRules)) {
    return normalizeHelpdeskVisibilityRules(category.visibilityRules);
  }

  const usersByUsername = new Map<string, number>();
  for (const user of [...availableUsers, ...relationItems(category?.defaultAssignee)]) {
    const username = normalizeUsername(user?.username || user?.email?.split('@')?.[0]);
    const id = normalizeId(user?.id);
    if (username && id) usersByUsername.set(username, id);
  }

  const assigneeUsernames = new Set(
    relationItems(category?.defaultAssignee)
      .map((user: any) => normalizeUsername(user?.username || user?.email?.split('@')?.[0]))
      .filter(Boolean)
  );
  const isPairCategory = DEFAULT_MUTUAL_VISIBILITY_USERNAMES.some((username) =>
    assigneeUsernames.has(username)
  );
  if (!isPairCategory) return [];

  const [ernarId, zhandosId] = DEFAULT_MUTUAL_VISIBILITY_USERNAMES.map((username) =>
    usersByUsername.get(username)
  );
  if (!ernarId || !zhandosId) return [];

  return [
    { viewerId: ernarId, targetUserIds: [zhandosId] },
    { viewerId: zhandosId, targetUserIds: [ernarId] },
  ];
}

export async function loadHelpdeskVisibilityScope(
  strapi: any,
  user: any
): Promise<HelpdeskVisibilityScope> {
  const viewerUserId = normalizeId(user?.id) || 0;
  const emptyScope: HelpdeskVisibilityScope = {
    viewerUserId,
    categoryTargetUserIds: {},
    isConfigured: false,
  };
  if (!viewerUserId) return emptyScope;

  const [categories, defaultUsers] = await Promise.all([
    strapi.entityService.findMany('api::ticket-category.ticket-category', {
      filters: {
        serviceGroup: {
          department: { key: { $in: HELPDESK_DEPARTMENT_KEYS } },
        },
      } as any,
      populate: { defaultAssignee: true } as any,
      pagination: { pageSize: 1000 },
    }),
    strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: {
        $or: [
          { username: { $in: DEFAULT_MUTUAL_VISIBILITY_USERNAMES } },
          { email: { $in: DEFAULT_MUTUAL_VISIBILITY_USERNAMES.map((name) => `${name}@nnmc.kz`) } },
        ],
      } as any,
      fields: ['id', 'username', 'email'],
      pagination: { pageSize: 10 },
    }),
  ]);

  const categoryTargetUserIds: Record<string, number[]> = {};
  let isConfigured = false;

  for (const category of (categories || []) as any[]) {
    const rule = resolveHelpdeskCategoryVisibilityRules(category, defaultUsers as any[])
      .find((item) => item.viewerId === viewerUserId);
    if (!rule) continue;

    isConfigured = true;
    categoryTargetUserIds[String(category.id)] = rule.targetUserIds;
  }

  return {
    viewerUserId,
    categoryTargetUserIds,
    isConfigured,
  };
}

export function buildHelpdeskVisibilityFilter(scope: HelpdeskVisibilityScope): any {
  const ownUserId = scope.viewerUserId;
  const filters: any[] = [
    { assignee: { id: ownUserId } },
    { completedBy: { id: ownUserId } },
  ];

  for (const [categoryId, targetUserIds] of Object.entries(scope.categoryTargetUserIds)) {
    if (targetUserIds.length === 0) continue;
    filters.push({
      $and: [
        { category: { id: Number(categoryId) } },
        {
          $or: [
            { assignee: { id: { $in: targetUserIds } } },
            { completedBy: { id: { $in: targetUserIds } } },
          ],
        },
      ],
    });
  }

  return { $or: filters };
}

export function scopeAllowsTicket(
  scope: HelpdeskVisibilityScope | undefined,
  ticket: any
): boolean {
  if (!scope?.isConfigured) return false;

  const categoryId = normalizeId(ticket?.category?.id || ticket?.category);
  if (!categoryId) return false;
  const targetUserIds = new Set(scope.categoryTargetUserIds[String(categoryId)] || []);
  if (targetUserIds.size === 0) return false;

  const assigneeIds = relationItems(ticket?.assignee)
    .map((assignee: any) => normalizeId(assignee?.id || assignee))
    .filter((id): id is number => Boolean(id));
  const completedById = normalizeId(ticket?.completedBy?.id || ticket?.completedBy);

  return assigneeIds.some((id) => targetUserIds.has(id)) ||
    Boolean(completedById && targetUserIds.has(completedById));
}

export function getHelpdeskVisibleUserIds(scope: HelpdeskVisibilityScope): number[] {
  return Array.from(
    new Set([
      scope.viewerUserId,
      ...Object.values(scope.categoryTargetUserIds).flat(),
    ])
  );
}
