import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHelpdeskVisibilityFilter,
  normalizeHelpdeskVisibilityRules,
  resolveHelpdeskCategoryVisibilityRules,
  type HelpdeskVisibilityScope,
} from '../src/utils/helpdesk-visibility';
import { userCanManageTicket, userCanViewTicket } from '../src/api/ticket/controllers/ticket';

const ernar = {
  id: 21,
  username: 'ernar',
  department: { key: 'IT', canManageTickets: true },
};
const zhandos = {
  id: 20,
  username: 'zhandos',
  department: { key: 'IT', canManageTickets: true },
};
const ernarScope: HelpdeskVisibilityScope = {
  viewerUserId: 21,
  categoryTargetUserIds: { 5: [20] },
  isConfigured: true,
};
const zhandosScope: HelpdeskVisibilityScope = {
  viewerUserId: 20,
  categoryTargetUserIds: { 5: [21] },
  isConfigured: true,
};

test('normalizes visibility rules and preserves an explicit empty rule', () => {
  assert.deepEqual(
    normalizeHelpdeskVisibilityRules([
      { viewerId: 20, targetUserIds: [21, 21, 20] },
      { viewerId: 21, targetUserIds: [] },
    ]),
    [
      { viewerId: 20, targetUserIds: [21] },
      { viewerId: 21, targetUserIds: [] },
    ]
  );
});

test('existing Ernar and Zhandos categories receive mutual visibility defaults', () => {
  const rules = resolveHelpdeskCategoryVisibilityRules(
    {
      defaultAssignee: [
        { id: 21, username: 'ernar' },
        { id: 20, username: 'zhandos' },
      ],
    },
    []
  );

  assert.deepEqual(rules, [
    { viewerId: 21, targetUserIds: [20] },
    { viewerId: 20, targetUserIds: [21] },
  ]);
});

test('an explicit category configuration disables the mutual default', () => {
  assert.deepEqual(
    resolveHelpdeskCategoryVisibilityRules({
      visibilityRules: [],
      defaultAssignee: [
        { id: 21, username: 'ernar' },
        { id: 20, username: 'zhandos' },
      ],
    }),
    []
  );
});

test('Ernar and Zhandos can view each other tickets only in configured categories', () => {
  const ernarTicket = {
    category: { id: 5 },
    assignee: [{ id: 21, username: 'ernar' }],
    requester: { id: 99 },
  };
  const zhandosTicket = {
    category: { id: 5 },
    assignee: [{ id: 20, username: 'zhandos' }],
    requester: { id: 99 },
  };

  assert.equal(userCanViewTicket(zhandos, ernarTicket, false, zhandosScope), true);
  assert.equal(userCanViewTicket(ernar, zhandosTicket, false, ernarScope), true);
  assert.equal(
    userCanViewTicket(ernar, { ...zhandosTicket, category: { id: 6 } }, false, ernarScope),
    false
  );
});

test('visibility does not grant management rights over another user ticket', () => {
  const zhandosTicket = {
    category: { id: 5 },
    assignee: [{ id: 20, username: 'zhandos' }],
  };

  assert.equal(userCanManageTicket(ernar, zhandosTicket, false, ernarScope), false);
  assert.equal(
    userCanManageTicket(ernar, { ...zhandosTicket, assignee: [{ id: 21 }] }, false, ernarScope),
    true
  );
  assert.equal(userCanManageTicket(ernar, zhandosTicket, true, ernarScope), true);
});

test('visibility list filter includes own and category-scoped assignments', () => {
  assert.deepEqual(buildHelpdeskVisibilityFilter(ernarScope), {
    $or: [
      { assignee: { id: 21 } },
      { completedBy: { id: 21 } },
      {
        $and: [
          { category: { id: 5 } },
          {
            $or: [
              { assignee: { id: { $in: [20] } } },
              { completedBy: { id: { $in: [20] } } },
            ],
          },
        ],
      },
    ],
  });
});
