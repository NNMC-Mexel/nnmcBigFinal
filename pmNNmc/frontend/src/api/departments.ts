import client from './client';
import type { Department } from '../types';

export const departmentsApi = {
  getAll: async (): Promise<Department[]> => {
    const response = await client.get('/departments', {
      params: {
        pagination: { pageSize: 100 },
      },
    });
    return response.data.data || [];
  },
};
