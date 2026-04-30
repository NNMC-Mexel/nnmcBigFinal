export default {
  routes: [
    {
      method: 'GET',
      path: '/notifications/mine',
      handler: 'notification.mine',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/notifications/unread-count',
      handler: 'notification.unreadCount',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/notifications/:id/read',
      handler: 'notification.markRead',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/notifications/mark-all-read',
      handler: 'notification.markAllRead',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/internal-notifications',
      handler: 'notification.createInternal',
      // Authorized by X-Internal-Token; bypass JWT auth.
      config: { auth: false },
    },
  ],
};
