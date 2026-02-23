import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProjectProgressFromTasks } from './taskProgress';

test('computeProjectProgressFromTasks returns 0 when empty', () => {
  assert.equal(computeProjectProgressFromTasks([]), 0);
});

test('computeProjectProgressFromTasks counts completed tasks', () => {
  const progress = computeProjectProgressFromTasks([
    { completed: true },
    { completed: false },
    { completed: true },
  ] as any);
  assert.equal(progress, 67);
});
