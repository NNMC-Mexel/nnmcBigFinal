import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::task.task', {
  config: {
    find: { policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }] },
    findOne: { policies: [{ name: 'global::feature-access', config: { feature: 'projects' } }] },
    create: {
      policies: [
        { name: 'global::feature-access', config: { feature: 'projects' } },
        'global::task-department',
      ],
    },
    update: {
      policies: [
        { name: 'global::feature-access', config: { feature: 'projects' } },
        'global::task-department',
      ],
    },
    delete: {
      policies: [
        { name: 'global::feature-access', config: { feature: 'projects' } },
        'global::task-department',
      ],
    },
  },
});
