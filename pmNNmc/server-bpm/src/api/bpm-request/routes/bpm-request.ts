export default {
  routes: [
    {
      method: 'GET',
      path: '/bpm-requests',
      handler: 'bpm-request.find',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/bpm-requests/top-types',
      handler: 'bpm-request.topTypes',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/bpm-requests/:id',
      handler: 'bpm-request.findOne',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/vacation',
      handler: 'bpm-request.createVacation',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/send-to-1c',
      handler: 'bpm-request.sendToOneC',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/advance',
      handler: 'bpm-request.advance',
      config: { policies: [] },
    }
  ]
};
