export default {
  routes: [
    {
      method: 'GET',
      path: '/projects/assignable-users',
      handler: 'project.assignableUsers',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }],
      },
    },
  ],
};
