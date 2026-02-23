import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectsQuery } from './projects';

test('buildProjectsQuery defaults to excluding deleted', () => {
  const query = buildProjectsQuery();
  assert.equal(query['filters[status][$ne]'], 'DELETED');
  assert.equal(query['filters[status][$eq]'], undefined);
});

test('buildProjectsQuery respects status filter', () => {
  const query = buildProjectsQuery({ status: 'ARCHIVED' });
  assert.equal(query['filters[status][$eq]'], 'ARCHIVED');
  assert.equal(query['filters[status][$ne]'], undefined);
});

test('buildProjectsQuery applies department and search', () => {
  const query = buildProjectsQuery({ department: 'IT', search: 'alpha' });
  assert.equal(query['filters[department][key][$eq]'], 'IT');
  assert.equal(query['filters[title][$containsi]'], 'alpha');
});

test('buildProjectsQuery populates task assignees', () => {
  const query = buildProjectsQuery();
  const values = Object.values(query);
  assert.equal(values.includes('tasks.assignee'), true);
});
