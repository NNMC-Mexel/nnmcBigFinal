import { errors } from '@strapi/utils';
import { getRequestUserId } from '../../../../utils/activity-log';

const { ValidationError } = errors;

const normalizeDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const resolveProjectByWhere = async (where: any, strapi: any) => {
  if (!where) return null;
  if (where.id) {
    return await strapi.entityService.findOne('api::project.project', where.id, {
      fields: ['startDate', 'dueDate'],
    });
  }
  if (where.documentId) {
    return await strapi.documents('api::project.project').findOne({
      documentId: where.documentId,
      fields: ['startDate', 'dueDate'],
    });
  }
  return null;
};

const validateProjectDates = async (event: any, strapi: any) => {
  const data = event?.params?.data || {};
  const hasStartDate = Object.prototype.hasOwnProperty.call(data, 'startDate');
  const hasDueDate = Object.prototype.hasOwnProperty.call(data, 'dueDate');

  let startDateValue = hasStartDate ? data.startDate : undefined;
  let dueDateValue = hasDueDate ? data.dueDate : undefined;

  if (!hasStartDate || !hasDueDate) {
    const existing = await resolveProjectByWhere(event?.params?.where, strapi);
    if (existing) {
      if (!hasStartDate) startDateValue = existing.startDate;
      if (!hasDueDate) dueDateValue = existing.dueDate;
    }
  }

  const startDate = normalizeDate(startDateValue);
  const dueDate = normalizeDate(dueDateValue);

  if (!startDate || !dueDate) {
    throw new ValidationError('Project start and due dates are required.');
  }

  if (dueDate < startDate) {
    throw new ValidationError('Project due date cannot be earlier than start date.');
  }
};

export default {
  async beforeCreate(event: any) {
    const { params } = event;
    const strapi = (global as any).strapi;

    await validateProjectDates(event, strapi);

    if (params?.data?.manualStageOverride) {
      return;
    }

    const firstStage = (await strapi.entityService.findMany('api::board-stage.board-stage', {
      sort: { order: 'asc' },
      pagination: { pageSize: 1 },
    })) as any[];

    if (firstStage[0]?.id) {
      params.data.manualStageOverride = firstStage[0].id;
    }
  },

  async afterCreate(event: any) {
    const { result } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi);

    try {
      await strapi.entityService.create('api::activity-log.activity-log', {
        data: {
          action: 'CREATE_PROJECT',
          description: `Создан проект: "${result.title}"`,
          project: result.id,
          user: userId,
          metadata: { projectTitle: result.title },
        },
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  },

  async beforeUpdate(event: any) {
    const strapi = (global as any).strapi;
    await validateProjectDates(event, strapi);
  },

  async afterUpdate(event: any) {
    const { result, params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi);

    try {
      const data = params.data || {};
      const changes = Object.keys(data || {});
      const logEntries: Array<{ action: string; description: string; metadata?: any }> = [];

      if (Object.prototype.hasOwnProperty.call(data, 'manualStageOverride')) {
        logEntries.push({
          action: 'MOVE_STAGE',
          description: `Перемещён проект: "${result.title}"`,
          metadata: { projectTitle: result.title, changes },
        });
      }

      if (data?.status === 'DELETED') {
        logEntries.push({
          action: 'DELETE_PROJECT',
          description: `Удалён проект: "${result.title}"`,
          metadata: { projectTitle: result.title, changes },
        });
      }

      const assignmentFields = ['owner', 'supportingSpecialists', 'responsibleUsers'];
      const hasAssignmentChange = assignmentFields.some((field) =>
        Object.prototype.hasOwnProperty.call(data, field)
      );
      if (hasAssignmentChange) {
        logEntries.push({
          action: 'ASSIGN_USER',
          description: `Назначены исполнители проекта: "${result.title}"`,
          metadata: { projectTitle: result.title, changes, fields: assignmentFields },
        });
      }

      const updateFields = changes.filter(
        (field) => field !== 'manualStageOverride' && !assignmentFields.includes(field)
      );
      const shouldLogUpdate = updateFields.length > 0 && data?.status !== 'DELETED';

      if (shouldLogUpdate) {
        logEntries.push({
          action: 'UPDATE_PROJECT',
          description: `Обновлён проект: "${result.title}"`,
          metadata: { projectTitle: result.title, changes },
        });
      }

      for (const entry of logEntries) {
        await strapi.entityService.create('api::activity-log.activity-log', {
          data: {
            action: entry.action,
            description: entry.description,
            project: result.id,
            user: userId,
            metadata: entry.metadata || { projectTitle: result.title, changes },
          },
        });
      }
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  },
};
