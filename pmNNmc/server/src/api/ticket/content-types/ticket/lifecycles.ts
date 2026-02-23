export default {
  async beforeCreate(event: any) {
    const strapi = (global as any).strapi;

    // Generate ticket number
    const count = await strapi.db.query('api::ticket.ticket').count({});
    event.params.data.ticketNumber = `HD-${String(count + 1).padStart(4, '0')}`;

    // Helper to extract one ID from various Strapi relation formats
    const extractRelationId = (relation: any): number | null => {
      if (!relation) return null;
      if (typeof relation === 'number') return relation;
      if (typeof relation === 'string') return parseInt(relation);
      if (relation.id) return relation.id;
      // Handle { connect: [{ id: X }] } format
      if (relation.connect && Array.isArray(relation.connect) && relation.connect[0]?.id) {
        return relation.connect[0].id;
      }
      // Handle { set: [{ id: X }] } format (Strapi v5)
      if (relation.set && Array.isArray(relation.set) && relation.set[0]?.id) {
        return relation.set[0].id;
      }
      return null;
    };

    // Helper to extract many IDs from various Strapi relation formats
    const extractRelationIds = (relation: any): number[] => {
      if (!relation) return [];
      if (typeof relation === 'number') return [relation];
      if (typeof relation === 'string') {
        const parsed = parseInt(relation, 10);
        return Number.isNaN(parsed) ? [] : [parsed];
      }

      if (Array.isArray(relation)) {
        return relation
          .map((item) => extractRelationId(item))
          .filter((id): id is number => Boolean(id));
      }

      if (relation.id) return [relation.id];
      if (relation.connect && Array.isArray(relation.connect)) {
        return relation.connect
          .map((item: any) => extractRelationId(item))
          .filter((id: number | null): id is number => Boolean(id));
      }
      if (relation.set && Array.isArray(relation.set)) {
        return relation.set
          .map((item: any) => extractRelationId(item))
          .filter((id: number | null): id is number => Boolean(id));
      }

      return [];
    };

    // Check if assignee is already set
    const existingAssigneeIds = extractRelationIds(event.params.data.assignee);

    // Auto-assign all default category executors to ticket
    const categoryId = extractRelationId(event.params.data.category);

    console.log(
      `🎫 beforeCreate: categoryId=${categoryId}, existingAssigneeIds=${JSON.stringify(existingAssigneeIds)}, raw category=`,
      event.params.data.category
    );

    if (categoryId && existingAssigneeIds.length === 0) {
      try {
        const category = await strapi.entityService.findOne(
          'api::ticket-category.ticket-category',
          categoryId,
          { populate: ['defaultAssignee'] }
        );

        const assigneeIds = extractRelationIds(category?.defaultAssignee);

        console.log(
          `🎫 Category found: ${category?.name_ru}; assigneeIds=${JSON.stringify(assigneeIds)}`
        );

        if (assigneeIds.length > 0) {
          event.params.data.assignee = {
            set: assigneeIds.map((id) => ({ id })),
          };
          console.log(
            `🎫 Auto-assigned ticket to users ${JSON.stringify(assigneeIds)} based on category ${categoryId}`
          );
        } else {
          console.log(`🎫 No defaultAssignee found for category ${categoryId}`);
        }
      } catch (err) {
        console.error('Failed to auto-assign ticket:', err);
      }
    }
  },
};
