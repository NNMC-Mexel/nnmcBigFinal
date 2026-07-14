const DEFAULT_HELPDESK_SUPERVISION = 'zhandos=ernar';

export interface HelpdeskAssignmentScope {
  viewerUsername: string;
  assigneeUsernames: string[];
  isSupervisor: boolean;
}

function normalizeUsername(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Format: `supervisor=user1,user2;other-supervisor=user3`.
 * A listed subordinate is restricted to their own assigned tickets.
 */
export function parseHelpdeskSupervision(value: string): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const entry of String(value || '').split(';')) {
    const [rawSupervisor, rawSubordinates = ''] = entry.split('=', 2);
    const supervisor = normalizeUsername(rawSupervisor);
    if (!supervisor) continue;

    const subordinates = Array.from(
      new Set(
        rawSubordinates
          .split(',')
          .map(normalizeUsername)
          .filter((username) => username && username !== supervisor)
      )
    );
    if (subordinates.length > 0) result.set(supervisor, subordinates);
  }

  return result;
}

export function getHelpdeskAssignmentScope(
  user: any,
  value = process.env.HELPDESK_SUPERVISION || DEFAULT_HELPDESK_SUPERVISION
): HelpdeskAssignmentScope | null {
  const viewerUsername = normalizeUsername(user?.username);
  if (!viewerUsername) return null;

  const supervision = parseHelpdeskSupervision(value);
  const directSubordinates = supervision.get(viewerUsername);
  if (directSubordinates) {
    return {
      viewerUsername,
      assigneeUsernames: [viewerUsername, ...directSubordinates],
      isSupervisor: true,
    };
  }

  const isSubordinate = Array.from(supervision.values()).some((usernames) =>
    usernames.includes(viewerUsername)
  );
  if (!isSubordinate) return null;

  return {
    viewerUsername,
    assigneeUsernames: [viewerUsername],
    isSupervisor: false,
  };
}

