import { Context } from 'koa';
import { computeProjectProgressFromTasks } from '../../../utils/task-workflow';

export default {
  async summary(ctx: Context) {
    const strapi = (global as any).strapi;
    
    try {
      // Получаем параметр фильтрации по отделу
      const departmentFilter = ctx.query.department as string | undefined;
      
      // Строим фильтр
      const filters: any = {
        status: { $ne: 'DELETED' },
      };
      if (departmentFilter) {
        filters.department = { key: departmentFilter };
      }
      
      // Получаем проекты с фильтром по отделу
      const projects = await strapi.entityService.findMany('api::project.project', {
        filters,
        populate: ['tasks', 'department'],
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Вычисляем статистику
      let total = 0;
      let active = 0;
      let archived = 0;
      let overdue = 0;
      let dueSoon = 0;

      const byDepartment: Record<string, {
        departmentKey: string;
        total: number;
        active: number;
        archived: number;
        overdue: number;
        dueSoon: number;
      }> = {};

      const byPriority = { red: 0, yellow: 0, green: 0 };

      // Weekly stats (last 8 weeks)
      const weeklyCreated: Record<string, number> = {};
      const weeklyArchived: Record<string, number> = {};

      // Инициализируем недели
      for (let i = 0; i < 8; i++) {
        const weekStart = getWeekStart(new Date(today.getTime() - i * 7 * 24 * 60 * 60 * 1000));
        weeklyCreated[weekStart] = 0;
        weeklyArchived[weekStart] = 0;
      }

      for (const project of projects) {
        if (project.status === 'DELETED') {
          continue;
        }
        total++;

        const tasks = project.tasks || [];
        computeProjectProgressFromTasks(tasks);

        const dueDate = project.dueDate ? new Date(project.dueDate) : null;
        let isOverdue = false;
        let isDueSoon = false;

        if (dueDate && project.status === 'ACTIVE') {
          dueDate.setHours(0, 0, 0, 0);
          isOverdue = today > dueDate;
          
          if (!isOverdue) {
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            isDueSoon = diffDays <= 3 && diffDays >= 0;
          }
        }

        if (project.status === 'ACTIVE') {
          active++;
        } else if (project.status === 'ARCHIVED') {
          archived++;
        }

        if (isOverdue) overdue++;
        if (isDueSoon) dueSoon++;

        // По приоритету
        const priority = (project.priorityLight || 'GREEN').toLowerCase();
        if (priority === 'red') byPriority.red++;
        else if (priority === 'yellow') byPriority.yellow++;
        else byPriority.green++;

        // По отделам
        const deptKey = project.department?.key || 'UNKNOWN';
        if (!byDepartment[deptKey]) {
          byDepartment[deptKey] = {
            departmentKey: deptKey,
            total: 0,
            active: 0,
            archived: 0,
            overdue: 0,
            dueSoon: 0,
          };
        }
        byDepartment[deptKey].total++;
        if (project.status === 'ACTIVE') byDepartment[deptKey].active++;
        if (project.status === 'ARCHIVED') byDepartment[deptKey].archived++;
        if (isOverdue) byDepartment[deptKey].overdue++;
        if (isDueSoon) byDepartment[deptKey].dueSoon++;

        // Weekly stats
        const createdAt = new Date(project.createdAt);
        const createdWeek = getWeekStart(createdAt);
        if (weeklyCreated[createdWeek] !== undefined) {
          weeklyCreated[createdWeek]++;
        }

        if (project.status === 'ARCHIVED' && project.updatedAt) {
          const archivedAt = new Date(project.updatedAt);
          const archivedWeek = getWeekStart(archivedAt);
          if (weeklyArchived[archivedWeek] !== undefined) {
            weeklyArchived[archivedWeek]++;
          }
        }
      }

      // Форматируем weekly data
      const weeklyCreatedArray = Object.entries(weeklyCreated)
        .map(([weekStart, count]) => ({ weekStart, count }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

      const weeklyArchivedArray = Object.entries(weeklyArchived)
        .map(([weekStart, count]) => ({ weekStart, count }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

      ctx.body = {
        totals: {
          total,
          active,
          archived,
          overdue,
          dueSoon,
        },
        byDepartment: Object.values(byDepartment),
        byPriority,
        weeklyCreated: weeklyCreatedArray,
        weeklyArchived: weeklyArchivedArray,
        // Добавляем информацию о фильтре
        filteredByDepartment: departmentFilter || null,
      };
    } catch (error) {
      console.error('Analytics error:', error);
      ctx.throw(500, 'Error fetching analytics');
    }
  },
};

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}
