import test from 'node:test';
import assert from 'node:assert/strict';
import { getLegacyDepartmentKeyFromHeaders } from '../src/api/ticket/controllers/ticket';

test('legacy helpdesk origin maps 8080 to IT', () => {
  assert.equal(
    getLegacyDepartmentKeyFromHeaders({ origin: 'http://192.168.101.25:8080' }),
    'IT'
  );
});

test('legacy helpdesk origin maps 8081 to medical equipment', () => {
  assert.equal(
    getLegacyDepartmentKeyFromHeaders({ origin: 'http://192.168.101.25:8081' }),
    'MEDICAL_EQUIPMENT'
  );
});

test('legacy helpdesk referer maps 8082 to engineering', () => {
  assert.equal(
    getLegacyDepartmentKeyFromHeaders({ referer: 'http://192.168.101.25:8082/helpdesk.html' }),
    'ENGINEERING'
  );
});

test('legacy helpdesk origin ignores unknown ports', () => {
  assert.equal(
    getLegacyDepartmentKeyFromHeaders({ origin: 'http://192.168.101.25:13010' }),
    ''
  );
});
