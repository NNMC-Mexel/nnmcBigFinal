export default {
  routes: [
    {
      method: 'GET',
      path: '/analytics/summary',
      handler: 'analytics.summary',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'dashboard' } }],
        middlewares: [],
      },
    },
  ],
};
