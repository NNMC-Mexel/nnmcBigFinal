import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCreateArtDepartment,
  classifySchedule,
  eachDateInMonth,
  eventDayCode,
  isDateInRange,
  normalizedPeriodKey,
  plannedDayForDate,
} from '../src/api/art-period/services/art-engine';

test('allows ART period creation only to superadmin, HR, or assigned department responsible', () => {
  assert.equal(canCreateArtDepartment({
    isSuperAdmin: true,
    userDepartmentKey: '',
    userId: 10,
    responsibleUserId: null,
  }), true);
  assert.equal(canCreateArtDepartment({
    isSuperAdmin: false,
    userDepartmentKey: 'hr',
    userId: 10,
    responsibleUserId: null,
  }), true);
  assert.equal(canCreateArtDepartment({
    isSuperAdmin: false,
    userDepartmentKey: 'CLINIC',
    userId: 10,
    responsibleUserId: 10,
  }), true);
  assert.equal(canCreateArtDepartment({
    isSuperAdmin: false,
    userDepartmentKey: 'CLINIC',
    userId: 10,
    responsibleUserId: 11,
  }), false);
});

test('classifies common NNMC schedules without guessing unknown schedules', () => {
  assert.equal(classifySchedule('Пятидневка'), 'FIVE_DAY');
  assert.equal(classifySchedule('Шестидневка'), 'SIX_DAY');
  assert.equal(classifySchedule('Сутки через двое'), 'SHIFT');
  assert.equal(classifySchedule('Специальный график'), 'CUSTOM');
});

test('generates a deterministic five-day plan', () => {
  assert.deepEqual(
    plannedDayForDate({ date: '2026-07-27', scheduleKind: 'FIVE_DAY' }),
    { code: 'WORK', hours: 8, start: '08:00:00', end: '17:00:00' }
  );
  assert.deepEqual(
    plannedDayForDate({ date: '2026-08-01', scheduleKind: 'FIVE_DAY' }),
    { code: 'UNASSIGNED', hours: 0, start: null, end: null }
  );
  assert.equal(plannedDayForDate({ date: '2026-07-27', scheduleKind: 'SHIFT' }).code, 'UNASSIGNED');
});

test('generates calendar dates and normalized keys', () => {
  assert.equal(eachDateInMonth(2028, 2).length, 29);
  assert.equal(normalizedPeriodKey(2026, 7, '', 'Отдел кардиохирургии'), '2026-07-отдел-кардиохирургии');
});

test('maps approved BPM event types to ART codes', () => {
  assert.equal(eventDayCode('SICK_LEAVE'), 'SICK_LEAVE');
  assert.equal(eventDayCode('VACATION'), 'VACATION');
  assert.equal(eventDayCode('UNKNOWN'), null);
  assert.equal(isDateInRange('2026-07-10', '2026-07-01', '2026-07-10'), true);
});
