import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::meeting-note.meeting-note', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const requestData = ctx.request.body.data || {};
    
    // Handle project relation - convert documentId to ID if needed
    let projectId = requestData.project;
    if (requestData.project && typeof requestData.project === 'string') {
      // Try to find project by documentId and get its numeric ID
      try {
        const project = await strapi.documents('api::project.project').findOne({
          documentId: requestData.project,
        });
        if (project) {
          projectId = project.id;
        } else {
          throw new Error('Project not found');
        }
      } catch (error) {
        console.error('Error finding project by documentId:', error);
        // If lookup fails, return error
        return ctx.badRequest('Project not found');
      }
    }

    // Prepare data for creation
    const createData: any = {
      text: requestData.text || '',
      project: projectId,
      author: user.id,
    };

    try {
      // Use entityService to create the meeting note
      const meetingNote = await strapi.entityService.create('api::meeting-note.meeting-note', {
        data: createData,
        populate: ['project', 'author'],
      });

      return { data: meetingNote };
    } catch (error: any) {
      console.error('Meeting note create error:', error.message, error.details);
      throw error;
    }
  },
}));
