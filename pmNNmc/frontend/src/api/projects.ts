import client from './client';
import type { Project, AssignableUser, Task } from '../types';

const normalizeTask = (task: any): Task => {
  const completed =
    typeof task?.completed === 'boolean'
      ? task.completed
      : typeof task?.progress === 'number'
        ? task.progress >= 100
        : task?.status === 'PRODUCTION' || task?.status === 'ARCHIVED';
  return {
    ...task,
    completed,
  } as Task;
};

const normalizeProject = (item: any): Project => {
  const tasks = Array.isArray(item?.tasks) ? item.tasks.map(normalizeTask) : item?.tasks;
  return {
    ...item,
    id: item.id,
    documentId: item.documentId,
    tasks,
  };
};

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
    'populate[6]': 'manualStageOverride',
    'populate[7]': 'meetings',
    'populate[8]': 'meetings.author',
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

export const projectsApi = {
  getAll: async (params?: {
    status?: Project['status'] | string;
    department?: string;
    search?: string;
  }): Promise<Project[]> => {
    const response = await client.get('/projects', {
      params: buildProjectsQuery(params),
    });
    
    // Map Strapi v5 response to include documentId as id for routing
    const data = response.data.data || [];
    return data.map(normalizeProject);
  },

  getOne: async (id: number | string): Promise<Project> => {
    // In Strapi v5, we need to use documentId for single item access
    // Use string format for nested populate (like in surveys.ts)
    const response = await client.get(`/projects/${id}`, {
      params: {
        'populate[0]': 'department',
        'populate[1]': 'tasks',
        'populate[2]': 'tasks.assignee',
        'populate[3]': 'responsibleUsers',
        'populate[4]': 'owner',
        'populate[5]': 'supportingSpecialists',
        'populate[6]': 'manualStageOverride',
        'populate[7]': 'meetings',
        'populate[8]': 'meetings.author',
      },
    });
    return normalizeProject(response.data.data);
  },

  create: async (data: Partial<Project>): Promise<Project> => {
    const response = await client.post('/projects', { data });
    return response.data.data;
  },

  update: async (id: number | string, data: Partial<Project>): Promise<Project> => {
    const response = await client.put(`/projects/${id}`, { data });
    return response.data.data;
  },

  delete: async (id: number | string): Promise<void> => {
    await client.delete(`/projects/${id}`);
  },

  softDelete: async (id: number | string): Promise<Project> => {
    const response = await client.put(`/projects/${id}`, {
      data: { status: 'DELETED' },
    });
    return response.data.data;
  },

  archive: async (id: number | string): Promise<Project> => {
    const response = await client.put(`/projects/${id}`, {
      data: { status: 'ARCHIVED' },
    });
    return response.data.data;
  },

  restore: async (id: number | string): Promise<Project> => {
    const response = await client.put(`/projects/${id}`, {
      data: { status: 'ACTIVE' },
    });
    return response.data.data;
  },

  updateStage: async (id: number | string, stageId: number | null): Promise<Project> => {
    const response = await client.put(`/projects/${id}`, {
      data: { manualStageOverride: stageId },
    });
    return response.data.data;
  },

  getAssignableUsers: async (departmentKey?: string): Promise<AssignableUser[]> => {
    const response = await client.get('/projects/assignable-users', {
      params: departmentKey ? { department: departmentKey } : undefined,
    });
    return response.data.data || [];
  },
};
