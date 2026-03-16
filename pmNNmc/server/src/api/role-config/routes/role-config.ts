export default {
  routes: [
    {
      method: 'GET',
      path: '/role-configs',
      handler: 'role-config.find',
    },
    {
      method: 'PUT',
      path: '/role-configs/:id',
      handler: 'role-config.update',
    },
  ],
};
