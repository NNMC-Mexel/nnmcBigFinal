export default {
  routes: [
    {
      method: 'POST',
      path: '/feedback',
      handler: 'feedback.send',
      config: { policies: [], middlewares: [] },
    },
  ],
};
