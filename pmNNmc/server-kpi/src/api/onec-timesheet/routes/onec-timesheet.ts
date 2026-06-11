export default {
  routes: [
    {
      method: 'GET',
      path: '/onec-timesheets',
      handler: 'onec-timesheet.list',
      config: {
        auth: { scope: [] },
      },
    },
    {
      method: 'GET',
      path: '/onec-timesheets/:id/download',
      handler: 'onec-timesheet.download',
      config: {
        auth: { scope: [] },
      },
    },
  ],
};
