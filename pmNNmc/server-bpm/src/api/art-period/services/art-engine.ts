import { createHash } from 'node:crypto';

export type ArtScheduleKind = 'FIVE_DAY' | 'SIX_DAY' | 'SHIFT' | 'CUSTOM';
export type ArtPhase = 'PLAN' | 'ACTUAL' | 'CLOSED';
export type ArtStatus =
  | 'DRAFT'
  | 'MANAGER_REVIEW'
  | 'HR_REVIEW'
  | 'ACTIVE'
  | 'FINAL_HR_REVIEW'
  | 'APPROVED'
  | 'ONEC_PENDING'
  | 'ONEC_SENT'
  | 'KPI_READY'
  | 'CLOSED'
  | 'RETURNED';

export type ArtDayCode = {
  code: string;
  label: string;
  shortLabel: string;
  color: string;
  kind: 'work' | 'absence' | 'rest' | 'attention';
  defaultHours: number;
  onecCode: string;
};

export const DEFAULT_ART_DAY_CODES: ArtDayCode[] = [
  { code: 'WORK', label: 'Рабочий день', shortLabel: 'Я', color: 'emerald', kind: 'work', defaultHours: 8, onecCode: '' },
  { code: 'SHIFT_24', label: 'Суточная смена', shortLabel: 'С24', color: 'blue', kind: 'work', defaultHours: 24, onecCode: '' },
  { code: 'DAY_OFF', label: 'Выходной', shortLabel: 'В', color: 'slate', kind: 'rest', defaultHours: 0, onecCode: '' },
  { code: 'VACATION', label: 'Отпуск', shortLabel: 'О', color: 'amber', kind: 'absence', defaultHours: 0, onecCode: '' },
  { code: 'SICK_LEAVE', label: 'Больничный', shortLabel: 'Б', color: 'rose', kind: 'absence', defaultHours: 0, onecCode: '' },
  { code: 'DAY_OFF_GRANTED', label: 'Отгул', shortLabel: 'ОВ', color: 'cyan', kind: 'absence', defaultHours: 0, onecCode: '' },
  { code: 'BUSINESS_TRIP', label: 'Командировка', shortLabel: 'К', color: 'violet', kind: 'work', defaultHours: 8, onecCode: '' },
  { code: 'UNPAID_LEAVE', label: 'Отпуск без оплаты', shortLabel: 'ДО', color: 'orange', kind: 'absence', defaultHours: 0, onecCode: '' },
  { code: 'CHILDCARE_LEAVE', label: 'Отпуск по уходу', shortLabel: 'ОЖ', color: 'pink', kind: 'absence', defaultHours: 0, onecCode: '' },
  { code: 'WEEKEND_WORK', label: 'Работа в выходной', shortLabel: 'РВ', color: 'teal', kind: 'work', defaultHours: 8, onecCode: '' },
  { code: 'OVERTIME', label: 'Сверхурочная работа', shortLabel: 'С', color: 'indigo', kind: 'work', defaultHours: 0, onecCode: '' },
  { code: 'UNASSIGNED', label: 'Требует назначения', shortLabel: '?', color: 'yellow', kind: 'attention', defaultHours: 0, onecCode: '' },
];

export const DEFAULT_ART_POLICY = {
  policyKey: 'NNMC_ART_DEFAULT',
  name: 'Базовая политика АРТ АО «ННМЦ»',
  active: true,
  version: 1,
  dayCodes: DEFAULT_ART_DAY_CODES,
  scheduleRules: {
    FIVE_DAY: { weekdays: [1, 2, 3, 4, 5], code: 'WORK', hours: 8, start: '08:00:00', end: '17:00:00', workingSaturdaysPerMonth: 1, saturdaySelection: 'MANUAL' },
    SIX_DAY: { requiresManualAssignment: true },
    SHIFT: { requiresManualAssignment: true },
    CUSTOM: { requiresManualAssignment: true },
  },
  holidayDates: [],
  onecMappings: {
    documentType: 11,
    note: 'Коды дней подтверждаются совместно с HR, бухгалтерией и специалистом 1С до production-передачи.',
  },
};

export const ART_TRANSITIONS: Record<string, {
  from: ArtStatus[];
  to: ArtStatus;
  phase?: ArtPhase;
  role: 'RESPONSIBLE' | 'MANAGER' | 'HR' | 'SUPERADMIN';
}> = {
  submit_plan: { from: ['DRAFT', 'RETURNED'], to: 'MANAGER_REVIEW', phase: 'PLAN', role: 'RESPONSIBLE' },
  approve_manager: { from: ['MANAGER_REVIEW'], to: 'HR_REVIEW', phase: 'PLAN', role: 'MANAGER' },
  approve_plan_hr: { from: ['HR_REVIEW'], to: 'ACTIVE', phase: 'ACTUAL', role: 'HR' },
  submit_actual: { from: ['ACTIVE', 'RETURNED'], to: 'FINAL_HR_REVIEW', phase: 'ACTUAL', role: 'RESPONSIBLE' },
  approve_actual_hr: { from: ['FINAL_HR_REVIEW'], to: 'ONEC_PENDING', phase: 'ACTUAL', role: 'HR' },
  close: { from: ['KPI_READY'], to: 'CLOSED', phase: 'CLOSED', role: 'HR' },
  reopen: { from: ['APPROVED', 'ONEC_PENDING', 'ONEC_SENT', 'KPI_READY', 'CLOSED'], to: 'ACTIVE', phase: 'ACTUAL', role: 'SUPERADMIN' },
};

const EVENT_CODE: Record<string, string> = {
  VACATION: 'VACATION',
  SICK_LEAVE: 'SICK_LEAVE',
  DAY_OFF: 'DAY_OFF_GRANTED',
  WEEKEND_WORK: 'WEEKEND_WORK',
  OVERTIME: 'OVERTIME',
  CHILDCARE_LEAVE: 'CHILDCARE_LEAVE',
  UNPAID_LEAVE: 'UNPAID_LEAVE',
  BUSINESS_TRIP: 'BUSINESS_TRIP',
  CHILDCARE_RETURN: 'WORK',
  VACATION_RECALL: 'WORK',
};

export function cleanArtString(value: unknown): string {
  return String(value ?? '').trim();
}

export function canCreateArtDepartment(options: {
  isSuperAdmin: boolean;
  userDepartmentKey: unknown;
  userId: unknown;
  responsibleUserId: unknown;
}): boolean {
  const userId = Number(options.userId);
  const responsibleUserId = Number(options.responsibleUserId);
  return options.isSuperAdmin
    || cleanArtString(options.userDepartmentKey).toUpperCase() === 'HR'
    || (
      Number.isFinite(userId)
      && userId > 0
      && Number.isFinite(responsibleUserId)
      && responsibleUserId === userId
    );
}

export function artDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function artDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function eachDateInMonth(year: number, month: number): string[] {
  const result: string[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month - 1) {
    result.push(artDateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function classifySchedule(scheduleName: unknown): ArtScheduleKind {
  const value = cleanArtString(scheduleName).toLocaleLowerCase('ru-RU');
  if (!value) return 'CUSTOM';
  if (/(сут|смен|24\s*час|через\s*(двое|два|три))/.test(value)) return 'SHIFT';
  if (/(шест|6\s*\/\s*1|шестиднев)/.test(value)) return 'SIX_DAY';
  if (/(пяти|5\s*\/\s*2|пять\s*дн|пятиднев)/.test(value)) return 'FIVE_DAY';
  return 'CUSTOM';
}

export function plannedDayForDate(options: {
  date: string;
  scheduleKind: ArtScheduleKind;
  holidayDates?: string[];
}) {
  const holidays = new Set(options.holidayDates || []);
  if (holidays.has(options.date)) {
    return { code: 'DAY_OFF', hours: 0, start: null, end: null };
  }

  if (options.scheduleKind !== 'FIVE_DAY') {
    return { code: 'UNASSIGNED', hours: 0, start: null, end: null };
  }

  const weekday = artDate(options.date).getUTCDay();
  if (weekday === 6 && Number(options.date.slice(8, 10)) <= 7) {
    return { code: 'UNASSIGNED', hours: 0, start: null, end: null };
  }
  if (weekday === 0 || weekday === 6) {
    return { code: 'DAY_OFF', hours: 0, start: null, end: null };
  }
  return { code: 'WORK', hours: 8, start: '08:00:00', end: '17:00:00' };
}

export function eventDayCode(type: unknown): string | null {
  return EVENT_CODE[cleanArtString(type).toUpperCase()] || null;
}

export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

export function codeDefaultHours(code: string, codes: ArtDayCode[] = DEFAULT_ART_DAY_CODES): number {
  return Number(codes.find((item) => item.code === code)?.defaultHours || 0);
}

export function isUnresolvedCode(code: unknown): boolean {
  return !cleanArtString(code) || cleanArtString(code) === 'UNASSIGNED';
}

export function sourceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizedPeriodKey(year: number, month: number, departmentId: unknown, departmentName: unknown): string {
  const department = cleanArtString(departmentId || departmentName)
    .toLocaleLowerCase('ru-RU')
    .replace(/[^a-zа-яё0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '');
  return `${year}-${String(month).padStart(2, '0')}-${department || 'department'}`;
}

export function decimal(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
