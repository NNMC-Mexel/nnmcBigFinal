import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::ticket.ticket', {
  config: {
    find: { policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }] },
    findOne: { policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }] },
    create: { policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }] },
    update: { policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }] },
    delete: { policies: [{ name: 'global::feature-access', config: { feature: 'helpdesk' } }] },
  },
});
