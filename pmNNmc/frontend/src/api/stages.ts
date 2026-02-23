import client from './client';
import type { BoardStage } from '../types';

export const stagesApi = {
  getAll: async (): Promise<BoardStage[]> => {
    const response = await client.get('/board-stages', {
      params: {
        sort: ['order:asc'],
        pagination: { pageSize: 100 },
      },
    });
    return response.data.data || [];
  },

  update: async (documentId: string, data: Partial<BoardStage>): Promise<BoardStage> => {
    const response = await client.put(`/board-stages/${documentId}`, { data });
    return response.data.data;
  },
};
