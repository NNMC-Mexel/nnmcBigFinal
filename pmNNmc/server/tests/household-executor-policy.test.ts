import test from 'node:test';
import assert from 'node:assert/strict';
import { userCanManageHouseholdExecutors } from '../src/api/ticket/controllers/ticket';

test('engineering department dispatcher can manage household executor pool via department flag', () => {
  assert.equal(
    userCanManageHouseholdExecutors({
      department: { key: 'ENGINEERING', canManageTickets: true },
    }),
    true
  );
});

test('department ticket manager outside engineering cannot manage household executor pool', () => {
  assert.equal(
    userCanManageHouseholdExecutors({
      department: { key: 'IT', canManageTickets: true },
    }),
    false
  );
});

test('engineering department head can manage household executor pool', () => {
  assert.equal(
    userCanManageHouseholdExecutors({
      position: 'Начальник хозслужбы',
      department: { key: 'ENGINEERING' },
    }),
    true
  );
});
