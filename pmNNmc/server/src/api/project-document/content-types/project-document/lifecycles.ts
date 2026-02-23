import { getRequestUserId } from '../../../../utils/activity-log';

export default {
  async afterCreate(event: any) {
    const { result, params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi) ?? params.data?.uploadedBy ?? null;

    try {
      const projectId = params.data?.project ?? null;
      let projectTitle = '';
      if (projectId) {
        const project = await strapi.entityService.findOne('api::project.project', projectId);
        projectTitle = project?.title || '';
      }

      await strapi.entityService.create('api::activity-log.activity-log', {
        data: {
          action: 'CREATE_DOCUMENT',
          description: `Добавлен документ к проекту "${projectTitle}"`,
          project: projectId,
          user: userId,
          metadata: { projectTitle, documentId: result?.id },
        },
      });
    } catch (error) {
      console.error('Failed to log document activity:', error);
    }
  },

  async beforeDelete(event: any) {
    const { params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi) ?? null;

    try {
      const doc = await strapi.entityService.findOne('api::project-document.project-document', params.where.id, {
        populate: ['project'],
      });

      const projectTitle = doc?.project?.title || '';
      const projectId = doc?.project?.id || null;

      await strapi.entityService.create('api::activity-log.activity-log', {
        data: {
          action: 'DELETE_DOCUMENT',
          description: `Удалён документ из проекта "${projectTitle}"`,
          project: projectId,
          user: userId,
          metadata: { projectTitle, documentId: doc?.id },
        },
      });
    } catch (error) {
      console.error('Failed to log document deletion:', error);
    }
  },
};
