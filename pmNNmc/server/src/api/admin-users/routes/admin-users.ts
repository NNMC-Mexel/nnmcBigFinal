export default {
  routes: [
    // ─── Users (no params) ───────────────────────────────
    {
      method: 'GET',
      path: '/admin-users',
      handler: 'admin-users.find',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/admin-users/create-keycloak',
      handler: 'admin-users.createKeycloakUser',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/admin-users',
      handler: 'admin-users.create',
      config: { policies: [] },
    },

    // ─── Departments (must be BEFORE :id routes) ─────────
    {
      method: 'GET',
      path: '/admin-users/departments',
      handler: 'admin-users.getDepartments',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/admin-users/departments',
      handler: 'admin-users.createDepartment',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/admin-users/departments/permissions',
      handler: 'admin-users.updateDepartmentPermissions',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/admin-users/departments/:id',
      handler: 'admin-users.updateDepartment',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-users/departments/:id',
      handler: 'admin-users.deleteDepartment',
      config: { policies: [] },
    },

    // ─── Users with :id param (AFTER static paths) ───────
    {
      method: 'GET',
      path: '/admin-users/:id',
      handler: 'admin-users.findOne',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/admin-users/:id',
      handler: 'admin-users.update',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/admin-users/:id/reset-password',
      handler: 'admin-users.resetPassword',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/admin-users/:id',
      handler: 'admin-users.delete',
      config: { policies: [] },
    },
  ],
};
