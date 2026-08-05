export default {
  routes: [
    { method: 'GET', path: '/project-calculations/context', handler: 'project-calculation.context', config: { policies: [] } },
    { method: 'GET', path: '/project-calculations/settings', handler: 'project-calculation.getSettings', config: { policies: [] } },
    { method: 'PUT', path: '/project-calculations/settings', handler: 'project-calculation.updateSettings', config: { policies: [] } },
    { method: 'GET', path: '/project-calculations', handler: 'project-calculation.findMany', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations', handler: 'project-calculation.create', config: { policies: [] } },
    { method: 'GET', path: '/project-calculations/:id', handler: 'project-calculation.findOne', config: { policies: [] } },
    { method: 'PUT', path: '/project-calculations/:id', handler: 'project-calculation.update', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/submit', handler: 'project-calculation.submit', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/start-review', handler: 'project-calculation.startReview', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/return', handler: 'project-calculation.returnForRevision', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/approve', handler: 'project-calculation.approve', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/reject', handler: 'project-calculation.reject', config: { policies: [] } },
    { method: 'POST', path: '/project-calculations/:id/reopen', handler: 'project-calculation.reopen', config: { policies: [] } },
  ],
};
