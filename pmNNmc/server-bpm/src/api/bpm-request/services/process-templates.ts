export type BpmProcessFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'money'
  | 'boolean'
  | 'select'
  | 'repeater';

export type BpmProcessField = {
  key: string;
  label: string;
  type: BpmProcessFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  columns?: BpmProcessField[];
};

export type BpmProcessTemplate = {
  code: string;
  integrationType: number;
  title: string;
  description: string;
  category: 'EMPLOYEE' | 'HR' | 'TIME';
  documentObject: string;
  staffOnly?: boolean;
  employeeMode: 'self' | 'single' | 'multiple' | 'none';
  fields: BpmProcessField[];
};

export type BpmWorkflowRole = 'MANAGER' | 'HR' | 'ACCOUNTING' | 'ONEC';

export type BpmWorkflowStep = {
  key: string;
  status: 'MANAGER_REVIEW' | 'HR_REVIEW' | 'ACCOUNTING_REVIEW' | 'ONEC_PENDING';
  title: string;
  role: BpmWorkflowRole;
};

export const BPM_WORKFLOW_VERSION = '2.0';

const MANAGER_STEP: BpmWorkflowStep = {
  key: 'manager-review',
  status: 'MANAGER_REVIEW',
  title: 'Согласование руководителем',
  role: 'MANAGER',
};
const HR_STEP: BpmWorkflowStep = {
  key: 'hr-review',
  status: 'HR_REVIEW',
  title: 'Проверка отделом кадров',
  role: 'HR',
};
const ACCOUNTING_STEP: BpmWorkflowStep = {
  key: 'accounting-review',
  status: 'ACCOUNTING_REVIEW',
  title: 'Проверка бухгалтерией',
  role: 'ACCOUNTING',
};
const ONEC_STEP: BpmWorkflowStep = {
  key: 'onec-transfer',
  status: 'ONEC_PENDING',
  title: 'Готово к передаче в 1С',
  role: 'ONEC',
};

function cloneSteps(steps: BpmWorkflowStep[]): BpmWorkflowStep[] {
  return steps.map((step) => ({ ...step }));
}

export function getProcessWorkflow(templateOrCode: BpmProcessTemplate | string): BpmWorkflowStep[] {
  const code = typeof templateOrCode === 'string' ? templateOrCode : templateOrCode.code;
  if (code === 'PHYSICAL_PERSON') return cloneSteps([HR_STEP, ONEC_STEP]);
  if (code === 'HIRING' || code === 'CHILDCARE_RETURN') {
    return cloneSteps([HR_STEP, ACCOUNTING_STEP, ONEC_STEP]);
  }
  if (code === 'TIMESHEET' || code === 'SCHEDULE_CHANGE') {
    return cloneSteps([MANAGER_STEP, HR_STEP, ONEC_STEP]);
  }
  return cloneSteps([MANAGER_STEP, HR_STEP, ACCOUNTING_STEP, ONEC_STEP]);
}

const dateRangeFields: BpmProcessField[] = [
  { key: 'datestart', label: 'Дата начала', type: 'date', required: true },
  { key: 'dateend', label: 'Дата окончания', type: 'date', required: true },
];

const sickLeaveReasons = [
  'Заболевание или травма (кроме травм на производстве)',
  'Отпуск по беременности и родам',
  'Травма на производстве',
  'Профзаболевание',
  'Уход за больным ребенком',
  'Карантин',
  'Протезирование в стационаре',
  'Долечивание в санаторно-курортных учреждениях',
];

export const BPM_PROCESS_TEMPLATES: BpmProcessTemplate[] = [
  {
    code: 'PHYSICAL_PERSON',
    integrationType: 1,
    title: 'Физическое лицо',
    description: 'Проверка или создание физического лица перед кадровыми документами',
    category: 'HR',
    documentObject: 'Справочник.ФизическиеЛица',
    staffOnly: true,
    employeeMode: 'none',
    fields: [
      { key: 'id', label: 'Табельный номер', type: 'text', required: true },
      { key: 'iin', label: 'ИИН', type: 'text', required: true, placeholder: '12 цифр' },
      { key: 'gender', label: 'Пол', type: 'select', required: true, options: ['w', 'm'] },
      { key: 'pensold', label: 'Пенсионер по возрасту', type: 'boolean' },
      { key: 'pensserivce', label: 'Пенсионер по выслуге лет', type: 'boolean' },
      { key: 'disabled', label: 'Отношение к инвалидности', type: 'select', required: true, options: ['0', '1', '2'] },
      { key: 'disabledgroup', label: 'Группа инвалидности', type: 'select', required: true, options: ['0', '1', '2', '3'] },
      { key: 'idcarddate', label: 'Дата выдачи удостоверения', type: 'date', required: true },
      { key: 'idcardby', label: 'Кем выдано удостоверение', type: 'text', required: true },
    ],
  },
  {
    code: 'HIRING',
    integrationType: 2,
    title: 'Прием на работу',
    description: 'Оформление приема, договора, места работы и начислений',
    category: 'HR',
    documentObject: 'Документ.ПриемНаРаботу',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      { key: 'personpost', label: 'Должность', type: 'text', required: true },
      { key: 'typeemployed', label: 'Вид занятости', type: 'text', required: true },
      { key: 'division', label: 'Подразделение', type: 'text', required: true },
      { key: 'workchart', label: 'График работы', type: 'text', required: true },
      { key: 'dateaccept', label: 'Дата приема', type: 'date', required: true },
      { key: 'numberOrder', label: 'Номер приказа', type: 'text' },
      { key: 'numberContract', label: 'Номер трудового договора', type: 'text', required: true },
      { key: 'DateContract', label: 'Дата трудового договора', type: 'date', required: true },
      {
        key: 'AddMoney', label: 'Начисления', type: 'repeater', required: true, columns: [
          { key: 'TypeAddMoney', label: 'Вид начисления', type: 'text', required: true },
          { key: 'quantityAddMoney', label: 'Сумма', type: 'money', required: true, min: 0 },
        ],
      },
    ],
  },
  {
    code: 'PERSONNEL_TRANSFER',
    integrationType: 3,
    title: 'Кадровое перемещение',
    description: 'Изменение должности, подразделения, графика и начислений',
    category: 'HR',
    documentObject: 'Документ.КадровоеПеремещение',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      { key: 'personpostold', label: 'Прежняя должность', type: 'text', required: true },
      { key: 'personpostnew', label: 'Новая должность', type: 'text', required: true },
      { key: 'divisionold', label: 'Прежнее подразделение', type: 'text', required: true },
      { key: 'divisionnew', label: 'Новое подразделение', type: 'text', required: true },
      { key: 'workchartold', label: 'Прежний график', type: 'text', required: true },
      { key: 'workchartnew', label: 'Новый график', type: 'text', required: true },
      { key: 'numberOrder', label: 'Номер приказа', type: 'text' },
      { key: 'eventDate', label: 'Дата события', type: 'date', required: true },
      {
        key: 'AddMoney', label: 'Новые начисления', type: 'repeater', columns: [
          { key: 'TypeAddMoney', label: 'Вид начисления', type: 'text', required: true },
          { key: 'quantityAddMoney', label: 'Сумма', type: 'money', required: true, min: 0 },
        ],
      },
    ],
  },
  {
    code: 'DISMISSAL',
    integrationType: 4,
    title: 'Увольнение',
    description: 'Оформление последнего рабочего дня и основания увольнения',
    category: 'HR',
    documentObject: 'Документ.Увольнение',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      { key: 'dateaccept', label: 'Последний рабочий день', type: 'date', required: true },
      { key: 'article', label: 'Статья и основание увольнения', type: 'textarea', required: true },
      { key: 'compensate', label: 'Компенсировать неиспользованный отпуск', type: 'boolean' },
      { key: 'quantitydayscompens', label: 'Дней компенсации', type: 'number', min: 0 },
      { key: 'eventDate', label: 'Дата события', type: 'date', required: true },
    ],
  },
  {
    code: 'SICK_LEAVE',
    integrationType: 5,
    title: 'Больничный лист',
    description: 'Регистрация периода и причины временной нетрудоспособности',
    category: 'EMPLOYEE',
    documentObject: 'Документ.БольничныйЛист',
    employeeMode: 'self',
    fields: [
      ...dateRangeFields,
      { key: 'reason', label: 'Причина нетрудоспособности', type: 'select', required: true, options: sickLeaveReasons },
      { key: 'numberlist', label: 'Номер листка нетрудоспособности', type: 'text', required: true },
      { key: 'eventDate', label: 'Дата события', type: 'date', required: true },
    ],
  },
  {
    code: 'VACATION',
    integrationType: 6,
    title: 'Отпуск',
    description: 'Основной и дополнительный оплачиваемый отпуск',
    category: 'EMPLOYEE',
    documentObject: 'Документ.Отпуск',
    employeeMode: 'self',
    fields: [
      ...dateRangeFields,
      { key: 'datestartwork', label: 'Рабочий период с', type: 'date', required: true },
      { key: 'dateendwork', label: 'Рабочий период по', type: 'date', required: true },
      { key: 'additional', label: 'Предоставляется дополнительный отпуск', type: 'boolean' },
      {
        key: 'AdditionalVacation', label: 'Дополнительные отпуска', type: 'repeater', columns: [
          { key: 'datestart', label: 'Начало', type: 'date', required: true },
          { key: 'dateend', label: 'Окончание', type: 'date', required: true },
          { key: 'datestartwork', label: 'Рабочий период с', type: 'date', required: true },
          { key: 'dateendwork', label: 'Рабочий период по', type: 'date', required: true },
        ],
      },
    ],
  },
  {
    code: 'DAY_OFF',
    integrationType: 7,
    title: 'Отгул',
    description: 'Заявка на один или несколько дней отгула',
    category: 'EMPLOYEE',
    documentObject: 'Документ.Отгул',
    employeeMode: 'self',
    fields: dateRangeFields,
  },
  {
    code: 'WEEKEND_WORK',
    integrationType: 8,
    title: 'Работа в выходной день',
    description: 'Оформление работы в выходной или праздничный день',
    category: 'TIME',
    documentObject: 'Документ.РаботаВВыходнойДень',
    staffOnly: true,
    employeeMode: 'single',
    fields: [{ key: 'dateaccept', label: 'Отработанный день', type: 'date', required: true }],
  },
  {
    code: 'OVERTIME',
    integrationType: 9,
    title: 'Сверхурочная работа',
    description: 'Учет даты и количества сверхурочных часов',
    category: 'TIME',
    documentObject: 'Документ.РаботаСверхурочно',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      { key: 'dateaccept', label: 'Дата сверхурочной работы', type: 'date', required: true },
      { key: 'quantityHours', label: 'Количество часов', type: 'number', required: true, min: 0, max: 24 },
    ],
  },
  {
    code: 'POSITION_COMBINATION',
    integrationType: 10,
    title: 'Совмещение должности',
    description: 'Исполнение обязанностей другого сотрудника и размер доплаты',
    category: 'HR',
    documentObject: 'Документ.СовмещениеДолжности',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      ...dateRangeFields,
      { key: 'PersonIdReplace', label: 'Табельный номер замещаемого сотрудника', type: 'text', required: true },
      { key: 'QuantityAddmoney', label: 'Размер доплаты', type: 'money', required: true, min: 0 },
    ],
  },
  {
    code: 'TIMESHEET',
    integrationType: 11,
    title: 'Табель рабочего времени',
    description: 'Фактический месячный табель подразделения по сотрудникам',
    category: 'TIME',
    documentObject: 'Документ.ТабельУчетаРабочегоВремени',
    staffOnly: true,
    employeeMode: 'multiple',
    fields: [
      { key: 'month', label: 'Месяц табелирования', type: 'text', required: true, placeholder: 'Например: июль 2026' },
      { key: 'division', label: 'Подразделение', type: 'text', required: true },
      {
        key: 'persons', label: 'Сотрудники и коды дней', type: 'repeater', required: true, columns: [
          { key: 'PersonId', label: 'Табельный номер', type: 'text', required: true },
          { key: 'days', label: 'Дни 1–31 через запятую', type: 'text', required: true, placeholder: 'я8н0,я8н0,выходной,...' },
        ],
      },
    ],
  },
  {
    code: 'CHILDCARE_LEAVE',
    integrationType: 12,
    title: 'Отпуск по уходу за ребенком',
    description: 'Оформление отпуска по уходу за ребенком',
    category: 'EMPLOYEE',
    documentObject: 'Документ.ОтпускПоУходуЗаРебенком',
    employeeMode: 'self',
    fields: dateRangeFields,
  },
  {
    code: 'CHILDCARE_RETURN',
    integrationType: 13,
    title: 'Возврат из отпуска по уходу',
    description: 'Досрочный или плановый возврат из отпуска по уходу',
    category: 'HR',
    documentObject: 'Документ.ВозвратИзОтпускаПоУходу',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      ...dateRangeFields,
      { key: 'docNumbermain', label: 'Номер исходного документа', type: 'text', required: true },
      { key: 'docDatemain', label: 'Дата исходного документа', type: 'date', required: true },
      { key: 'returndate', label: 'Дата выхода на работу', type: 'date', required: true },
    ],
  },
  {
    code: 'VACATION_RECALL',
    integrationType: 14,
    title: 'Отзыв из отпуска',
    description: 'Возврат сотрудника из трудового отпуска',
    category: 'HR',
    documentObject: 'Документ.ОтзывИзОтпуска',
    staffOnly: true,
    employeeMode: 'single',
    fields: [
      ...dateRangeFields,
      { key: 'docNumbermain', label: 'Номер документа отпуска', type: 'text', required: true },
      { key: 'docDatemain', label: 'Дата документа отпуска', type: 'date', required: true },
      { key: 'returndate', label: 'Дата возврата', type: 'date', required: true },
      { key: 'quantitydayscompens', label: 'Количество дней компенсации', type: 'number', required: true, min: 0 },
    ],
  },
  {
    code: 'UNPAID_LEAVE',
    integrationType: 15,
    title: 'Отпуск без сохранения оплаты',
    description: 'Отпуск без сохранения заработной платы',
    category: 'EMPLOYEE',
    documentObject: 'Документ.ОтпускБезСохраненияОплаты',
    employeeMode: 'self',
    fields: dateRangeFields,
  },
  {
    code: 'BUSINESS_TRIP',
    integrationType: 16,
    title: 'Командировка',
    description: 'Оформление периода служебной командировки',
    category: 'EMPLOYEE',
    documentObject: 'Документ.Командировка',
    employeeMode: 'self',
    fields: dateRangeFields,
  },
  {
    code: 'SCHEDULE_CHANGE',
    integrationType: 17,
    title: 'Изменение графиков работы',
    description: 'Назначение нового графика группе сотрудников',
    category: 'TIME',
    documentObject: 'Документ.ИзменениеГрафиковРаботы',
    staffOnly: true,
    employeeMode: 'multiple',
    fields: [
      { key: 'workchart', label: 'Новый график работы', type: 'text', required: true },
      {
        key: 'persons', label: 'Сотрудники', type: 'repeater', required: true, columns: [
          { key: 'personid', label: 'Табельный номер', type: 'text', required: true },
        ],
      },
    ],
  },
];

export const ONEC_REFERENCE_TYPES = [
  { type: 1, code: 'DEPARTMENT', title: 'Подразделения' },
  { type: 2, code: 'WORK_SCHEDULE', title: 'Графики работ' },
  { type: 3, code: 'ACCRUAL', title: 'Начисления' },
  { type: 4, code: 'DEDUCTION', title: 'Удержания' },
  { type: 5, code: 'POSITION', title: 'Должности' },
] as const;

export function getProcessTemplate(code: unknown): BpmProcessTemplate | null {
  const normalized = String(code || '').trim().toUpperCase();
  return BPM_PROCESS_TEMPLATES.find((template) => template.code === normalized) || null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function validateFields(fields: BpmProcessField[], data: Record<string, any>, prefix = ''): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const value = data?.[field.key];
    const label = prefix ? `${prefix}: ${field.label}` : field.label;
    if (field.required && (isEmpty(value) || (Array.isArray(value) && value.length === 0))) {
      errors.push(`Заполните поле «${label}»`);
      continue;
    }
    if (isEmpty(value)) continue;
    if (field.type === 'number' || field.type === 'money') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) errors.push(`Поле «${label}» должно быть числом`);
      if (field.min !== undefined && numeric < field.min) errors.push(`Поле «${label}» не может быть меньше ${field.min}`);
      if (field.max !== undefined && numeric > field.max) errors.push(`Поле «${label}» не может быть больше ${field.max}`);
    }
    if (field.type === 'repeater' && Array.isArray(value) && field.columns) {
      value.forEach((row, index) => errors.push(...validateFields(field.columns || [], row || {}, `${field.label}, строка ${index + 1}`)));
    }
  }
  return errors;
}

export function validateProcessData(template: BpmProcessTemplate, data: Record<string, any>): string[] {
  const errors = validateFields(template.fields, data || {});
  if (template.code === 'PHYSICAL_PERSON' && !/^\d{9}$/.test(String(data?.id || ''))) {
    errors.push('Табельный номер должен содержать 9 цифр');
  }
  if (template.code === 'PHYSICAL_PERSON' && !/^\d{12}$/.test(String(data?.iin || ''))) {
    errors.push('ИИН должен содержать 12 цифр');
  }
  const start = String(data?.datestart || '');
  const end = String(data?.dateend || '');
  if (start && end && end < start) errors.push('Дата окончания не может быть раньше даты начала');
  if (template.code === 'VACATION' && (data?.additional === true || data?.additional === 'true')) {
    if (!Array.isArray(data?.AdditionalVacation) || data.AdditionalVacation.length === 0) {
      errors.push('Добавьте хотя бы один период дополнительного отпуска');
    }
  }
  return errors;
}

export function formatOneCDate(value: unknown): string {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.replace(/-/g, '') : raw;
}

function normalizeValue(field: BpmProcessField, value: any): any {
  if (field.type === 'date') return formatOneCDate(value);
  if (field.type === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (field.type === 'number' || field.type === 'money') return String(value ?? '');
  if (field.type === 'repeater') {
    const rows = Array.isArray(value) ? value : [];
    return rows.map((row) => Object.fromEntries(
      (field.columns || []).map((column) => [column.key, normalizeValue(column, row?.[column.key])])
    ));
  }
  return value;
}

export function buildOneCPayload(options: {
  template: BpmProcessTemplate;
  requestNumber: string;
  documentDate: string;
  personnelNumber?: string;
  data: Record<string, any>;
}): Record<string, any> {
  const { template, requestNumber, documentDate, personnelNumber, data } = options;
  if (template.code === 'PHYSICAL_PERSON') {
    const person = Object.fromEntries(template.fields.map((field) => [field.key, normalizeValue(field, data?.[field.key])]));
    return { Persons: [person] };
  }

  const payload: Record<string, any> = {
    docNumber: requestNumber,
    docDate: formatOneCDate(documentDate),
  };
  if (template.employeeMode === 'self' || template.employeeMode === 'single') {
    payload.PersonId = String(personnelNumber || data?.PersonId || '').trim();
  }
  for (const field of template.fields) {
    const value = data?.[field.key];
    if (isEmpty(value) || (field.type === 'repeater' && (!Array.isArray(value) || value.length === 0))) continue;
    if (field.key === 'AdditionalVacation' && data?.additional !== true && data?.additional !== 'true') continue;
    if (template.code === 'TIMESHEET' && field.key === 'persons') {
      payload.persons = (Array.isArray(value) ? value : []).map((row: any) => {
        const result: Record<string, string> = { PersonId: String(row?.PersonId || '').trim() };
        String(row?.days || '').split(',').map((item) => item.trim()).slice(0, 31).forEach((code, index) => {
          result[`day${index + 1}`] = code;
        });
        return result;
      });
      continue;
    }
    payload[field.key] = normalizeValue(field, value);
  }
  return payload;
}

export function buildPhysicalPersonCheckPayload(options: {
  personnelNumber?: string;
  iin?: string;
}): Record<string, any> | null {
  const id = String(options.personnelNumber || '').trim();
  const iin = String(options.iin || '').trim();
  if (!id && !iin) return null;
  return { Persons: [{ id, iin }] };
}
