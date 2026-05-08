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
      method: 'GET',
      path: '/tickets/my-requests',
      handler: 'ticket.myRequests',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'POST',
      path: '/tickets/submit',
      handler: 'ticket.submit',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'POST',
      path: '/tickets/attachments/upload',
      handler: 'ticket.uploadAttachments',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/tickets/categories',
      handler: 'ticket.categories',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'POST',
      path: '/tickets/public/submit',
      handler: 'ticket.publicSubmit',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
      },
    },
    {
      method: 'GET',
      path: '/tickets/public/categories',
      handler: 'ticket.publicCategories',
      config: {
        policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }],
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
