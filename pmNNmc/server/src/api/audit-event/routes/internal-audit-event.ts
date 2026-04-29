export default {
  routes: [
    {
      method: 'POST',
      path: '/internal-audit-events',
      handler: 'audit-event.createInternal',
      config: { auth: false },
    },
  ],
};
