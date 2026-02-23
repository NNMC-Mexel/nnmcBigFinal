import client from './client';

export interface ActivityLog {
  id: number;
  documentId: string;
  action: string;
  description: string;
  user?: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
  };
  project?: {
    id: number;
    title: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const activityLogApi = {
  getAll: async (params?: { page?: number; pageSize?: number }): Promise<{ data: ActivityLog[]; meta: any }> => {
    const response = await client.get('/activity-logs', {
      params: {
        populate: ['user', 'project'],
        sort: ['createdAt:desc'],
        pagination: {
          page: params?.page || 1,
          pageSize: params?.pageSize || 50,
        },
      },
    });
    return response.data;
  },

  create: async (data: {
    action: string;
    description: string;
    user?: number;
    project?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ActivityLog> => {
    const response = await client.post('/activity-logs', { data });
    return response.data.data;
  },
};
