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
      path: '/bpm-requests/vacation-balance',
      handler: 'bpm-request.vacationBalance',
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
      path: '/bpm-requests/process',
      handler: 'bpm-request.createProcess',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/reference-data/sync',
      handler: 'bpm-request.syncReference',
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
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/return',
      handler: 'bpm-request.returnForCorrection',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/reject',
      handler: 'bpm-request.reject',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/cancel',
      handler: 'bpm-request.cancel',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/bpm-requests/:id/resubmit',
      handler: 'bpm-request.resubmit',
      config: { policies: [] },
    }
  ]
};
