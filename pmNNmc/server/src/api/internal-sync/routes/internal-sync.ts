export default {
  routes: [
    {
      method: 'GET',
      path: '/internal-sync/users',
      handler: 'internal-sync.users',
      // Authorization is handled inside the controller via X-Internal-Token header.
      // We disable Strapi auth here so cross-service calls (no JWT) can reach it.
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/internal-sync/departments',
      handler: 'internal-sync.departments',
      config: { auth: false },
    },
  ],
};
