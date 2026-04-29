import client from './client';

export type Notification = {
  id: number;
  title: string;
  body?: string;
  type?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  metadata?: any;
};

export const notificationsApi = {
  mine: async (unreadOnly = false, limit = 50): Promise<Notification[]> => {
    const response = await client.get('/notifications/mine', {
      params: { unread: unreadOnly ? 1 : 0, limit },
    });
    return response.data?.items || [];
  },

  unreadCount: async (): Promise<number> => {
    const response = await client.get('/notifications/unread-count');
    return Number(response.data?.count || 0);
  },

  markRead: async (id: number): Promise<void> => {
    await client.post(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await client.post('/notifications/mark-all-read');
  },
};
