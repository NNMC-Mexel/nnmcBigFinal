export default {
  routes: [
    {
      method: 'GET',
      path: '/admin-users',
      handler: 'admin-users.find',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-users/:id',
      handler: 'admin-users.findOne',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/admin-users',
      handler: 'admin-users.create',
      config: {
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin-users/:id',
      handler: 'admin-users.update',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/admin-users/:id/reset-password',
      handler: 'admin-users.resetPassword',
      config: {
        policies: [],
      },
    },
    {
      method: 'DELETE',
      path: '/admin-users/:id',
      handler: 'admin-users.delete',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/admin-users/roles/list',
      handler: 'admin-users.getRoles',
      config: {
        policies: [],
      },
    },
  ],
};
