import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTemporaryTicketNumber,
  buildTicketNumberFromId,
} from '../src/api/ticket/content-types/ticket/lifecycles';

test('temporary ticket numbers are unique for parallel creates', () => {
  const first = buildTemporaryTicketNumber();
  const second = buildTemporaryTicketNumber();

  assert.match(first, /^TMP-\d+-[0-9a-f-]+$/);
  assert.match(second, /^TMP-\d+-[0-9a-f-]+$/);
  assert.notEqual(first, second);
});

test('final ticket number is based on created row id', () => {
  assert.equal(buildTicketNumberFromId(1), 'HD-0001');
  assert.equal(buildTicketNumberFromId(125), 'HD-0125');
});
