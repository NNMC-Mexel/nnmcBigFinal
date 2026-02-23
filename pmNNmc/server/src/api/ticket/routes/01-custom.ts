export default {
  routes: [
    {
      method: 'GET',
      path: '/tickets/list',
      handler: 'ticket.findFiltered',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'POST',
      path: '/tickets/public/submit',
      handler: 'ticket.publicSubmit',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/tickets/public/categories',
      handler: 'ticket.publicCategories',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/tickets/:id/reassign',
      handler: 'ticket.reassign',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'GET',
      path: '/tickets/assignable-users',
      handler: 'ticket.assignableUsers',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
  ],
};
