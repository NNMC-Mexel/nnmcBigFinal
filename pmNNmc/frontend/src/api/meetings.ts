import client from './client';
import type { MeetingNote } from '../types';

export const meetingsApi = {
  create: async (data: {
    text: string;
    project: number | string;
    // author is set automatically by server
  }): Promise<MeetingNote> => {
    const response = await client.post('/meeting-notes', { data });
    return response.data.data;
  },

  update: async (documentId: string, data: { text: string }): Promise<MeetingNote> => {
    const response = await client.put(`/meeting-notes/${documentId}`, { data });
    return response.data.data;
  },

  delete: async (documentId: string): Promise<void> => {
    await client.delete(`/meeting-notes/${documentId}`);
  },
};
