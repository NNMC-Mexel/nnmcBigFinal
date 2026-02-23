import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::project.project', {
  config: {
    find: { policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }] },
    findOne: { policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }] },
    create: {
      policies: [
        { name: 'global::feature-access', config: { feature: 'projects' } },
        'global::project-assignees',
      ],
    },
    update: {
      policies: [
        { name: 'global::feature-access', config: { feature: 'projects' } },
        'global::project-assignees',
      ],
    },
    delete: { policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }] },
  },
});
