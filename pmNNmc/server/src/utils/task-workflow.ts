export const clampProgress = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
};

export const computeProjectProgressFromTasks = (tasks: unknown[]): {
  progressPercent: number;
  doneTasks: number;
  totalTasks: number;
} => {
  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    return { progressPercent: 0, doneTasks: 0, totalTasks: 0 };
  }

  let doneTasks = 0;

  tasks.forEach((task: any) => {
    const completed =
      typeof task?.completed === 'boolean'
        ? task.completed
        : typeof task?.progress === 'number'
          ? task.progress >= 100
          : task?.status === 'PRODUCTION' || task?.status === 'ARCHIVED';
    if (completed) {
      doneTasks += 1;
    }
  });

  const progressPercent = Math.round((doneTasks / totalTasks) * 100);
  return { progressPercent, doneTasks, totalTasks };
};

export const bucketStageOrder = (order?: number | null): number => {
  if (!order || !Number.isFinite(order)) return 1;
  if (order <= 1) return 1;
  if (order >= 5) return 5;
  return Math.round(order);
};
