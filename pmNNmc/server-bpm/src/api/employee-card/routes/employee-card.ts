export default {
  routes: [
    {
      method: 'GET',
      path: '/employee-cards',
      handler: 'employee-card.find',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/employee-cards/sync-status',
      handler: 'employee-card.syncStatus',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/employee-cards/me',
      handler: 'employee-card.me',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/employee-cards/sync',
      handler: 'employee-card.sync',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/employee-cards/:id',
      handler: 'employee-card.findOne',
      config: { policies: [] },
    }
  ]
};
