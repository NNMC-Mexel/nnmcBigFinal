import test from 'node:test';
import assert from 'node:assert/strict';
import taskDepartmentPolicy from '../src/policies/task-department';

type RoleType = 'super_admin' | 'admin' | 'lead' | 'member';
type DepartmentKey = 'IT' | 'DIGITALIZATION';

const makeCtx = (options: {
  userId?: number;
  method?: 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  paramsId?: number | string;
}) => {
  const errThrow = (status: number, message: string) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = status;
    throw error;
  };

  return {
    state: { user: { id: options.userId ?? 1 } },
    request: {
      method: options.method ?? 'POST',
      body: { data: options.data ?? {} },
    },
    params: options.paramsId ? { id: options.paramsId } : {},
    throw: errThrow,
  } as any;
};

const makeStrapi = (options: {
  requesterRole: RoleType;
  requesterDepartment?: DepartmentKey | null;
  projectDepartment: DepartmentKey;
  assigneeDepartment?: DepartmentKey;
}) => {
  const requesterDepartment = options.requesterDepartment ?? 'IT';

  const users: Record<number, any> = {
    1: {
      id: 1,
      role: { type: options.requesterRole, name: options.requesterRole },
      department: requesterDepartment ? { key: requesterDepartment } : null,
    },
    2: {
      id: 2,
      department: options.assigneeDepartment ? { key: options.assigneeDepartment } : null,
    },
  };

  const projects: Record<number, any> = {
    10: {
      id: 10,
      department: { key: options.projectDepartment },
    },
  };

  return {
    entityService: {
      findOne: async (uid: string, id: number) => {
        if (uid === 'plugin::users-permissions.user') return users[id] ?? null;
        if (uid === 'api::project.project') return projects[id] ?? null;
        if (uid === 'api::task.task') {
          return { id, project: projects[10], assignee: users[2] };
        }
        return null;
      },
    },
    documents: (_uid: string) => ({
      findOne: async () => null,
    }),
  } as any;
};

test('task department policy allows super admin across departments', async () => {
  const ctx = makeCtx({
    data: { project: 10, assignee: 2 },
  });
  const strapi = makeStrapi({
    requesterRole: 'super_admin',
    requesterDepartment: null,
    projectDepartment: 'DIGITALIZATION',
    assigneeDepartment: 'DIGITALIZATION',
  });

  const allowed = await taskDepartmentPolicy(ctx, {}, { strapi });
  assert.equal(allowed, true);
});

test('task department policy blocks non-superadmin on other department project', async () => {
  const ctx = makeCtx({
    data: { project: 10 },
  });
  const strapi = makeStrapi({
    requesterRole: 'admin',
    requesterDepartment: 'IT',
    projectDepartment: 'DIGITALIZATION',
  });

  await assert.rejects(
    () => taskDepartmentPolicy(ctx, {}, { strapi }),
    (error: any) => error?.status === 403
  );
});

test('task department policy blocks assignee from other department', async () => {
  const ctx = makeCtx({
    data: { project: 10, assignee: 2 },
  });
  const strapi = makeStrapi({
    requesterRole: 'admin',
    requesterDepartment: 'IT',
    projectDepartment: 'IT',
    assigneeDepartment: 'DIGITALIZATION',
  });

  await assert.rejects(
    () => taskDepartmentPolicy(ctx, {}, { strapi }),
    (error: any) => error?.status === 403
  );
});

test('task department policy allows same-department project and assignee', async () => {
  const ctx = makeCtx({
    data: { project: 10, assignee: 2 },
  });
  const strapi = makeStrapi({
    requesterRole: 'admin',
    requesterDepartment: 'IT',
    projectDepartment: 'IT',
    assigneeDepartment: 'IT',
  });

  const allowed = await taskDepartmentPolicy(ctx, {}, { strapi });
  assert.equal(allowed, true);
});

