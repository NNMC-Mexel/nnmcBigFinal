import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BPM_PROCESS_TEMPLATES,
  ONEC_REFERENCE_TYPES,
  buildOneCPayload,
  getProcessTemplate,
  validateProcessData,
} from '../src/api/bpm-request/services/process-templates';

test('contains all 17 document integration types without duplicates', () => {
  assert.equal(BPM_PROCESS_TEMPLATES.length, 17);
  assert.deepEqual(
    BPM_PROCESS_TEMPLATES.map((item) => item.integrationType).sort((a, b) => a - b),
    Array.from({ length: 17 }, (_, index) => index + 1)
  );
  assert.equal(new Set(BPM_PROCESS_TEMPLATES.map((item) => item.code)).size, 17);
});

test('keeps reference type namespace separate from document types', () => {
  assert.deepEqual(ONEC_REFERENCE_TYPES.map((item) => item.type), [1, 2, 3, 4, 5]);
  assert.equal(ONEC_REFERENCE_TYPES[0].code, 'DEPARTMENT');
});

test('builds vacation payload using the exact 1C field names and date format', () => {
  const template = getProcessTemplate('VACATION');
  assert.ok(template);
  const payload = buildOneCPayload({
    template,
    requestNumber: 'BPM-2026-000001',
    documentDate: '2026-07-22',
    personnelNumber: '000009870',
    data: {
      datestart: '2026-08-01',
      dateend: '2026-08-14',
      datestartwork: '2025-08-01',
      dateendwork: '2026-07-31',
      additional: true,
      AdditionalVacation: [{
        datestart: '2026-08-15',
        dateend: '2026-08-16',
        datestartwork: '2025-08-01',
        dateendwork: '2026-07-31',
      }],
    },
  });
  assert.equal(payload.docDate, '20260722');
  assert.equal(payload.PersonId, '000009870');
  assert.equal(payload.datestart, '20260801');
  assert.equal(payload.additional, 'true');
  assert.equal(payload.AdditionalVacation[0].dateend, '20260816');
});

test('expands timesheet day codes into day1 through day31 fields', () => {
  const template = getProcessTemplate('TIMESHEET');
  assert.ok(template);
  const payload = buildOneCPayload({
    template,
    requestNumber: 'BPM-2026-000002',
    documentDate: '2026-07-22',
    data: {
      month: 'июль 2026',
      division: 'ОЦМК-2',
      persons: [{ PersonId: '000009870', days: 'я8н0,выходной,больничный' }],
    },
  });
  assert.equal(payload.persons[0].day1, 'я8н0');
  assert.equal(payload.persons[0].day2, 'выходной');
  assert.equal(payload.persons[0].day3, 'больничный');
});

test('validates mandatory fields and chronological date ranges', () => {
  const template = getProcessTemplate('SICK_LEAVE');
  assert.ok(template);
  const errors = validateProcessData(template, {
    datestart: '2026-08-10',
    dateend: '2026-08-01',
  });
  assert.ok(errors.some((message) => message.includes('Причина нетрудоспособности')));
  assert.ok(errors.some((message) => message.includes('Дата окончания')));
});

test('requires an additional vacation row when the flag is enabled', () => {
  const template = getProcessTemplate('VACATION');
  assert.ok(template);
  const errors = validateProcessData(template, {
    datestart: '2026-08-01',
    dateend: '2026-08-10',
    datestartwork: '2025-08-01',
    dateendwork: '2026-07-31',
    additional: true,
    AdditionalVacation: [],
  });
  assert.ok(errors.some((message) => message.includes('дополнительного отпуска')));
});

test('validates the 9-digit personnel number required by the 1C contract', () => {
  const template = getProcessTemplate('PHYSICAL_PERSON')!;
  const data = Object.fromEntries(template.fields.map((field) => [field.key, field.type === 'boolean' ? false : '1']));
  data.iin = '031231650159';
  data.id = '123';
  assert.ok(validateProcessData(template, data).some((message) => message.includes('9 цифр')));
});
