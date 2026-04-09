import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::task.task', ({ strapi }) => ({
  // Custom create — bypass REST API sanitizer that rejects relation fields
  async create(ctx) {
    const data = ctx.request.body?.data || {};

    const entry = await strapi.entityService.create('api::task.task', {
      data: {
        title: data.title,
        description: data.description || null,
        completed: data.completed ?? false,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        endDate: data.endDate || null,
        order: data.order ?? 0,
        project: data.project || null,
        assignee: data.assignee || null,
      },
      populate: ['project', 'assignee'],
    });

    ctx.body = { data: entry };
  },

  // Custom update — bypass REST API sanitizer
  async update(ctx) {
    const paramId = ctx.params.id;
    const data = ctx.request.body?.data || {};

    // Resolve documentId → numeric id if needed
    let numericId = Number(paramId);
    if (isNaN(numericId)) {
      const doc = await strapi.documents('api::task.task').findOne({
        documentId: paramId,
        fields: ['id'],
      }) as any;
      if (!doc) { ctx.throw(404, 'Task not found'); return; }
      numericId = doc.id;
    }

    const updateData: Record<string, any> = {};
    const allowed = ['title', 'description', 'completed', 'startDate', 'dueDate', 'endDate', 'order', 'project', 'assignee'];
    for (const field of allowed) {
      if (field in data) updateData[field] = data[field];
    }

    const entry = await strapi.entityService.update('api::task.task', numericId, {
      data: updateData,
      populate: ['project', 'assignee'],
    });

    ctx.body = { data: entry };
  },
}));
