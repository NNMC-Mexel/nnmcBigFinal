import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getHelpdeskAssignmentScope,
  parseHelpdeskSupervision,
} from '../src/utils/helpdesk-visibility';
import { userCanManageTicket, userCanViewTicket } from '../src/api/ticket/controllers/ticket';

const supervision = 'zhandos=ernar;lead=user1,user2';

test('parses configurable HelpDesk supervisor assignments', () => {
  assert.deepEqual(Array.from(parseHelpdeskSupervision(supervision).entries()), [
    ['zhandos', ['ernar']],
    ['lead', ['user1', 'user2']],
  ]);
});

test('supervisor sees own and direct subordinate assignments', () => {
  assert.deepEqual(getHelpdeskAssignmentScope({ username: 'ZHANDOS' }, supervision), {
    viewerUsername: 'zhandos',
    assigneeUsernames: ['zhandos', 'ernar'],
    isSupervisor: true,
  });
});

test('subordinate is restricted to own assignments', () => {
  assert.deepEqual(getHelpdeskAssignmentScope({ username: 'ernar' }, supervision), {
    viewerUsername: 'ernar',
    assigneeUsernames: ['ernar'],
    isSupervisor: false,
  });
});

test('users outside configured hierarchy retain existing access rules', () => {
  assert.equal(getHelpdeskAssignmentScope({ username: 'said' }, supervision), null);
});

test('default hierarchy lets Zhandos manage Ernar tickets but not other IT tickets', () => {
  const zhandos = {
    id: 20,
    username: 'zhandos',
    department: { key: 'IT', canManageTickets: true },
  };

  assert.equal(
    userCanManageTicket(zhandos, { assignee: [{ id: 21, username: 'ernar' }] }, false),
    true
  );
  assert.equal(
    userCanManageTicket(zhandos, { assignee: [{ id: 22, username: 'said' }] }, false),
    false
  );
});

test('Ernar cannot manage Zhandos tickets despite department queue permission', () => {
  const ernar = {
    id: 21,
    username: 'ernar',
    department: { key: 'IT', canManageTickets: true },
  };

  assert.equal(
    userCanManageTicket(ernar, { assignee: [{ id: 20, username: 'zhandos' }] }, false),
    false
  );
  assert.equal(
    userCanManageTicket(ernar, { assignee: [{ id: 21, username: 'ernar' }] }, false),
    true
  );
});

test('Zhandos can view a ticket completed by Ernar even if Ernar is no longer assigned', () => {
  const zhandos = {
    id: 20,
    username: 'zhandos',
    department: { key: 'IT', canManageTickets: true },
  };
  const completedTicket = {
    assignee: [{ id: 22, username: 'said' }],
    completedBy: { id: 21, username: 'ernar' },
  };

  assert.equal(userCanManageTicket(zhandos, completedTicket, false), false);
  assert.equal(userCanViewTicket(zhandos, completedTicket, false), true);
});

test('Ernar cannot view tickets assigned to or completed by Zhandos', () => {
  const ernar = {
    id: 21,
    username: 'ernar',
    department: { key: 'IT', canManageTickets: true },
  };
  const zhandosTicket = {
    assignee: [{ id: 20, username: 'zhandos' }],
    completedBy: { id: 20, username: 'zhandos' },
    requester: { id: 99, username: 'requester' },
  };

  assert.equal(userCanViewTicket(ernar, zhandosTicket, false), false);
});
