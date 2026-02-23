import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketStageOrder,
  clampProgress,
  computeProjectProgressFromTasks,
} from '../src/utils/task-workflow';

test('clampProgress clamps invalid values', () => {
  assert.equal(clampProgress(-10), 0);
  assert.equal(clampProgress(150), 100);
  assert.equal(clampProgress('42'), 42);
  assert.equal(clampProgress(undefined, 5), 5);
});

test('computeProjectProgressFromTasks uses completed flags', () => {
  const result = computeProjectProgressFromTasks([
    { completed: true },
    { completed: false },
    { completed: true },
  ]);

  assert.equal(result.totalTasks, 3);
  assert.equal(result.doneTasks, 2);
  assert.equal(result.progressPercent, 67);
});

test('bucketStageOrder buckets out-of-range orders', () => {
  assert.equal(bucketStageOrder(undefined), 1);
  assert.equal(bucketStageOrder(0), 1);
  assert.equal(bucketStageOrder(3), 3);
  assert.equal(bucketStageOrder(6), 5);
});
