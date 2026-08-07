export default {
  routes: [
    {
      method: 'GET',
      path: '/health',
      handler: 'health.check',
      // Public on purpose: monitoring must reach it without a token.
      // The response carries no configuration details — see the controller.
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
