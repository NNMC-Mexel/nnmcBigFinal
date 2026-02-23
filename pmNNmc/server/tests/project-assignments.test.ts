import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAssigneeIds,
  getAssignableUserFilters,
  getRoleFlags,
  getOwnerIds,
} from '../src/utils/project-assignments';

test('getRoleFlags detects super admin by role type', () => {
  const flags = getRoleFlags({ type: 'super_admin', name: 'Super Admin' });
  assert.equal(flags.isSuperAdmin, true);
  assert.equal(flags.isAdmin, true);
});

test('getAssignableUserFilters respects super admin department override', () => {
  const filters = getAssignableUserFilters({
    isSuperAdmin: true,
    requesterDepartmentKey: 'IT',
    requestedDepartmentKey: 'DIGITALIZATION',
  });
  assert.deepEqual(filters, { department: { key: 'DIGITALIZATION' } });
});

test('getAssignableUserFilters allows matching department for non super admin', () => {
  const filters = getAssignableUserFilters({
    isSuperAdmin: false,
    requesterDepartmentKey: 'IT',
    requestedDepartmentKey: 'IT',
  });
  assert.deepEqual(filters, { department: { key: 'IT' } });
});

test('getAssignableUserFilters blocks non-super admin without department', () => {
  const filters = getAssignableUserFilters({
    isSuperAdmin: false,
    requesterDepartmentKey: null,
    requestedDepartmentKey: 'IT',
  });
  assert.equal(filters, null);
});

test('collectAssigneeIds extracts ids from mixed payloads', () => {
  const ids = collectAssigneeIds({
    owner: { id: 1 },
    supportingSpecialists: [{ id: 2 }, { id: 3 }],
    responsibleUsers: { connect: [{ id: 4 }, { id: 5 }] },
  });

  assert.deepEqual(ids.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('getOwnerIds accepts array payloads', () => {
  const ids = getOwnerIds({ owner: [{ id: 10 }, { id: 11 }] });
  assert.deepEqual(ids, [10, 11]);
});
