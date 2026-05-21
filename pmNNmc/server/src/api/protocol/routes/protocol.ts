export default {
  routes: [
    {
      method: 'GET',
      path: '/protocols',
      handler: 'protocol.findMany',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/protocols/:id',
      handler: 'protocol.findOne',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/protocols',
      handler: 'protocol.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/protocols/:id',
      handler: 'protocol.update',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/protocols/:id/publish',
      handler: 'protocol.publish',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/protocols/:id',
      handler: 'protocol.delete',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/protocols/users-by-department',
      handler: 'protocol.usersByDepartment',
      config: { policies: [], middlewares: [] },
    },
  ],
};
