import client from './client';
import type { AnalyticsSummary } from '../types';

export const analyticsApi = {
  getSummary: async (department?: string): Promise<AnalyticsSummary> => {
    const params: Record<string, string> = {};
    if (department) {
      params.department = department;
    }
    const response = await client.get('/analytics/summary', { params });
    return response.data;
  },
};
