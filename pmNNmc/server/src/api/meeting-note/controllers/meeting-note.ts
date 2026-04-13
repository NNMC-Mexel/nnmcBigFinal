import { factories } from '@strapi/strapi';

async function checkNoteOwnership(ctx: any, strapi: any, noteId: number) {
  const user = ctx.state.user;
  if (!user) { ctx.unauthorized('You must be logged in'); return null; }

  const note = await strapi.entityService.findOne('api::meeting-note.meeting-note', noteId, {
    populate: ['author'],
  });
  if (!note) { ctx.notFound(); return null; }

  if (note.author?.id !== user.id) {
    const fullUser = await strapi.entityService.findOne(
      'plugin::users-permissions.user', user.id, { fields: ['isSuperAdmin'] }
    ) as any;
    if (!fullUser?.isSuperAdmin) {
      ctx.forbidden('Only the author can modify this note');
      return null;
    }
  }

  return note;
}

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
      try {
        const project = await strapi.documents('api::project.project').findOne({
          documentId: requestData.project,
        });
        if (project) {
          projectId = project.id;
        } else {
          throw new Error('Project not found');
        }
      } catch {
        return ctx.badRequest('Project not found');
      }
    }

    const createData: any = {
      text: requestData.text || '',
      project: projectId,
      author: user.id,
    };

    try {
      const meetingNote = await strapi.entityService.create('api::meeting-note.meeting-note', {
        data: createData,
        populate: ['project', 'author'],
      });

      return { data: meetingNote };
    } catch (error: any) {
      if (error.status) throw error;
      throw error;
    }
  },

  async update(ctx) {
    const note = await checkNoteOwnership(ctx, strapi, ctx.params.id);
    if (!note) return;

    const requestData = ctx.request.body.data || {};
    const updated = await strapi.entityService.update('api::meeting-note.meeting-note', note.id, {
      data: { text: requestData.text ?? note.text },
      populate: ['project', 'author'],
    });

    return { data: updated };
  },

  async delete(ctx) {
    const note = await checkNoteOwnership(ctx, strapi, ctx.params.id);
    if (!note) return;

    await strapi.entityService.delete('api::meeting-note.meeting-note', note.id);
    return { data: { id: note.id } };
  },
}));
