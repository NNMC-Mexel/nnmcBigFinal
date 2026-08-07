import type { Project } from '../types';

// Kept free of runtime imports (no axios client) so it stays importable
// outside Vite — `tsx --test` has no `import.meta.env`.
export const buildProjectsQuery = (params?: {
  status?: Project['status'] | string;
  department?: string;
  search?: string;
}) => {
  const query: Record<string, string | number | boolean | undefined> = {
    'populate[0]': 'department',
    'populate[1]': 'tasks',
    'populate[2]': 'tasks.assignee',
    'populate[3]': 'responsibleUsers',
    'populate[4]': 'owner',
    'populate[5]': 'supportingSpecialists',
    'populate[6]': 'managers',
    'populate[7]': 'manualStageOverride',
    'populate[8]': 'meetings',
    'populate[9]': 'meetings.author',
    'sort[0]': 'createdAt:desc',
    'pagination[pageSize]': 100,
  };

  if (params?.status) {
    query['filters[status][$eq]'] = params.status;
  } else {
    query['filters[status][$ne]'] = 'DELETED';
  }
  if (params?.department) {
    query['filters[department][key][$eq]'] = params.department;
  }
  if (params?.search) {
    query['filters[title][$containsi]'] = params.search;
  }

  return query;
};
