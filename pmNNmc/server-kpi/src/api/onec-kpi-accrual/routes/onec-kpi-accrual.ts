export default {
  routes: [
    {
      method: 'POST',
      path: '/onec-kpi-accruals',
      handler: 'onec-kpi-accrual.create',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};
