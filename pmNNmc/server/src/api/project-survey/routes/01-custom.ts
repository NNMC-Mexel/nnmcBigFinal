export default {
  routes: [
    {
      method: 'GET',
      path: '/project-surveys/public/:token',
      handler: 'project-survey.findByToken',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/project-surveys/public/:token/submit',
      handler: 'project-survey.submitResponse',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/project-surveys/:id/results',
      handler: 'project-survey.getResults',
      config: {
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/project-surveys/:id/status',
      handler: 'project-survey.toggleStatus',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/project-surveys/:id/duplicate',
      handler: 'project-survey.duplicate',
      config: {
        policies: [],
      },
    },
  ],
};
