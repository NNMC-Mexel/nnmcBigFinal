export default {
  routes: [
    { method: 'GET', path: '/art/departments', handler: 'art-period.departments', config: { policies: [] } },
    { method: 'GET', path: '/art/periods', handler: 'art-period.find', config: { policies: [] } },
    { method: 'POST', path: '/art/periods', handler: 'art-period.create', config: { policies: [] } },
    { method: 'GET', path: '/art/periods/:id', handler: 'art-period.findOne', config: { policies: [] } },
    { method: 'PATCH', path: '/art/periods/:id/days', handler: 'art-period.updateDays', config: { policies: [] } },
    { method: 'POST', path: '/art/periods/:id/apply-pattern', handler: 'art-period.applyPattern', config: { policies: [] } },
    { method: 'POST', path: '/art/periods/:id/generate-actual', handler: 'art-period.generateActual', config: { policies: [] } },
    { method: 'POST', path: '/art/periods/:id/transition', handler: 'art-period.transition', config: { policies: [] } },
    { method: 'POST', path: '/art/periods/:id/send-to-1c', handler: 'art-period.sendToOneC', config: { policies: [] } },
    { method: 'POST', path: '/art/periods/:id/send-to-kpi', handler: 'art-period.sendToKpi', config: { policies: [] } },
    { method: 'GET', path: '/art/my-calendar', handler: 'art-period.myCalendar', config: { policies: [] } },
    { method: 'GET', path: '/art/policy', handler: 'art-period.policy', config: { policies: [] } },
    { method: 'PUT', path: '/art/policy', handler: 'art-period.updatePolicy', config: { policies: [] } },
  ],
};
