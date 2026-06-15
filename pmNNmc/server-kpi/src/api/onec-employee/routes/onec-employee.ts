export default {
  routes: [
    {
      method: 'GET',
      path: '/onec-employees',
      handler: 'onec-employee.list',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};
