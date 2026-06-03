export default {
  routes: [
    {
      // Upsert the current user's device token. Path differs from the core
      // /device-tokens to avoid colliding with any default CRUD route.
      method: 'POST',
      path: '/device-tokens/register',
      handler: 'device-token.register',
      config: { policies: [], middlewares: [] },
    },
  ],
};
