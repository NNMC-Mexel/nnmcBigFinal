import { errors } from '@strapi/utils';
import { getRequestUserId } from '../../../../utils/activity-log';

const { ValidationError } = errors;

const normalizeDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const resolveProjectId = async (projectValue: any, strapi: any): Promise<number | null> => {
  if (!projectValue) return null;
  if (typeof projectValue === 'number') return projectValue;
  if (typeof projectValue === 'string') {
    const project = await strapi.documents('api::project.project').findOne({ documentId: projectValue });
    return project?.id ?? null;
  }
  if (projectValue?.id) return projectValue.id;
  if (projectValue?.documentId) {
    const project = await strapi.documents('api::project.project').findOne({ documentId: projectValue.documentId });
    return project?.id ?? null;
  }
  if (projectValue?.connect) {
    const connectValue = Array.isArray(projectValue.connect) ? projectValue.connect[0] : projectValue.connect;
    return resolveProjectId(connectValue, strapi);
  }
  return null;
};

const resolveTaskProjectId = async (taskWhere: any, strapi: any): Promise<number | null> => {
  const taskIdValue = taskWhere?.id ?? taskWhere;
  if (!taskIdValue) return null;

  let taskId = taskIdValue;
  if (typeof taskId === 'string') {
    const task = await strapi.documents('api::task.task').findOne({ documentId: taskId });
    taskId = task?.id ?? null;
  }

  if (typeof taskId !== 'number') return null;

  const task = await strapi.entityService.findOne('api::task.task', taskId, {
    populate: ['project'],
  });

  return task?.project?.id ?? null;
};

const validateTaskDates = async (params: any, strapi: any) => {
  const hasDateUpdate = ['startDate', 'endDate', 'dueDate'].some((key) =>
    Object.prototype.hasOwnProperty.call(params.data || {}, key)
  );
  if (!hasDateUpdate) return;

  const projectId =
    (await resolveProjectId(params.data?.project, strapi)) ??
    (await resolveTaskProjectId(params.where, strapi));

  if (!projectId) return;

  const project = await strapi.entityService.findOne('api::project.project', projectId, {
    fields: ['dueDate'],
  });
  const projectDueDate = normalizeDate(project?.dueDate);
  if (!projectDueDate) return;

  const startDate = normalizeDate(params.data?.startDate);
  const endDate = normalizeDate(params.data?.endDate);
  const dueDate = normalizeDate(params.data?.dueDate);

  const exceedsDeadline =
    (startDate && startDate > projectDueDate) ||
    (endDate && endDate > projectDueDate) ||
    (dueDate && dueDate > projectDueDate);

  if (exceedsDeadline) {
    throw new ValidationError('Task dates cannot exceed project deadline.');
  }
};

const validateTaskCompletion = (params: any) => {
  if (!params?.data) return;
  if (Object.prototype.hasOwnProperty.call(params.data, 'completed')) {
    params.data.completed = Boolean(params.data.completed);
  }
  if (Object.prototype.hasOwnProperty.call(params.data, 'progress')) {
    delete params.data.progress;
  }
  if (Object.prototype.hasOwnProperty.call(params.data, 'status')) {
    delete params.data.status;
  }
  if (Object.prototype.hasOwnProperty.call(params.data, 'subtasks')) {
    delete params.data.subtasks;
  }
};

export default {
  async beforeCreate(event: any) {
    const { params } = event;
    const strapi = (global as any).strapi;

    await validateTaskDates(params, strapi);
    validateTaskCompletion(params);
  },

  async beforeUpdate(event: any) {
    const { params } = event;
    const strapi = (global as any).strapi;

    await validateTaskDates(params, strapi);
    validateTaskCompletion(params);
  },

  async afterCreate(event: any) {
    const { result, params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi);

    try {
      let projectId = null;
      let projectTitle = '';

      if (params.data?.project) {
        const project = await strapi.entityService.findOne('api::project.project', params.data.project);
        if (project) {
          projectId = project.id;
          projectTitle = project.title;
        }
      }

      await strapi.entityService.create('api::activity-log.activity-log', {
        data: {
          action: 'CREATE_TASK',
          description: `Добавлена задача "${result.title}" в проект "${projectTitle}"`,
          project: projectId,
          user: userId,
          metadata: { taskTitle: result.title, projectTitle },
        },
      });
    } catch (error) {
      console.error('Failed to log task activity:', error);
    }
  },

  async afterUpdate(event: any) {
    const { result, params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi);

    try {
      const task = await strapi.entityService.findOne('api::task.task', result.id, {
        populate: ['project'],
      });

      const projectTitle = task?.project?.title || '';
      const projectId = task?.project?.id || null;

      const logEntries: Array<{ action: string; description: string; metadata?: any }> = [];

      if (Object.prototype.hasOwnProperty.call(params.data || {}, 'completed')) {
        logEntries.push({
          action: 'MARK_TASK',
          description: params.data.completed
            ? `Отмечена выполненной задача "${result.title}"`
            : `Снята отметка выполнения с задачи "${result.title}"`,
          metadata: { taskTitle: result.title, projectTitle },
        });
      }

      if (Object.prototype.hasOwnProperty.call(params.data || {}, 'assignee')) {
        logEntries.push({
          action: 'ASSIGN_USER',
          description: `Назначен исполнитель задачи "${result.title}"`,
          metadata: { taskTitle: result.title, projectTitle },
        });
      }

      for (const entry of logEntries) {
        await strapi.entityService.create('api::activity-log.activity-log', {
          data: {
            action: entry.action,
            description: entry.description,
            project: projectId,
            user: userId,
            metadata: entry.metadata || { taskTitle: result.title, projectTitle },
          },
        });
      }
    } catch (error) {
      console.error('Failed to log task activity:', error);
    }
  },

  async beforeDelete(event: any) {
    const { params } = event;
    const strapi = (global as any).strapi;
    const userId = event?.state?.user?.id ?? getRequestUserId(strapi);

    try {
      const task = await strapi.entityService.findOne('api::task.task', params.where.id, {
        populate: ['project'],
      });

      if (task) {
        const projectTitle = task?.project?.title || '';
        const projectId = task?.project?.id || null;

        await strapi.entityService.create('api::activity-log.activity-log', {
          data: {
            action: 'DELETE_TASK',
            description: `Удалена задача "${task.title}" из проекта "${projectTitle}"`,
            project: projectId,
            user: userId,
            metadata: { taskTitle: task.title, projectTitle },
          },
        });
      }
    } catch (error) {
      console.error('Failed to log task deletion:', error);
    }
  },
};
