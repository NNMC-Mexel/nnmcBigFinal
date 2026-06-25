export default {
  routes: [
    {
      method: 'POST',
      path: '/onec-kpi-accruals/validate',
      handler: 'onec-kpi-accrual.validate',
      config: {
        auth: { scope: [] },
      },
    },
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
