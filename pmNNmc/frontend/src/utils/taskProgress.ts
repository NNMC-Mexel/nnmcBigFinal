import type { Task } from '../types';

export const computeProjectProgressFromTasks = (tasks: Task[]): number => {
  const list = Array.isArray(tasks) ? tasks : [];
  if (list.length === 0) return 0;
  const done = list.filter((task) => Boolean(task?.completed)).length;
  return Math.round((done / list.length) * 100);
};
