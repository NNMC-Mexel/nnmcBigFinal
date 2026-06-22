import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTicketSearchFilter } from '../src/api/ticket/controllers/ticket';

test('ticket search includes category names and slug', () => {
  assert.deepEqual(buildTicketSearchFilter('damumed'), {
    $or: [
      { requesterName: { $containsi: 'damumed' } },
      { ticketNumber: { $containsi: 'damumed' } },
      { requesterDepartment: { $containsi: 'damumed' } },
      { category: { name_ru: { $containsi: 'damumed' } } },
      { category: { name_kz: { $containsi: 'damumed' } } },
      { category: { slug: { $containsi: 'damumed' } } },
    ],
  });
});
