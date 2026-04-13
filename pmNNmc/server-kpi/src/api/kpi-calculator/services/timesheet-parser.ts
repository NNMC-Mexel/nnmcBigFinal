import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import { DateTime } from 'luxon';

interface Holiday {
  date?: string;
  year?: number;
  month?: number;
}

interface DayValue {
  day: number;
  month: number;
  year: number;
  value: string;
  dayType: 'weekday' | 'sat' | 'sun' | 'holiday';
  isNumber: boolean;
}

interface ParsedEmployee {
  fio: string;
  department?: string;
  letters_weekday: number;
  letters_sat: number;
  letters_sun: number;
  letters_holiday: number;
  numbers_weekday: number;
  numbers_sat: number;
  numbers_sun: number;
  numbers_holiday: number;
  dayValues?: DayValue[];
}

function normalizeHolidays(
  holidays: (string | number)[] | undefined,
  year: number,
  month: number
): Set<number> {
  const out = new Set<number>();
  if (!holidays) return out;

  for (const h of holidays) {
    if (h === null || h === undefined) continue;

    if (typeof h === 'number') {
      if (h >= 1 && h <= 31) out.add(h);
      continue;
    }

    const s = String(h).trim();
    if (!s) continue;

    if (s.includes('-')) {
      const parts = s.split('T')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const d = parseInt(parts[2]);
        if (y === year && m === month && d >= 1 && d <= 31) {
          out.add(d);
        }
      }
      continue;
    }

    if (/^\d+$/.test(s)) {
      const d = parseInt(s);
      if (d >= 1 && d <= 31) out.add(d);
    }
  }

  return out;
}

function classifyDay(
  year: number,
  month: number,
  dayNum: number,
  holidayDays: Set<number>
): 'weekday' | 'sat' | 'sun' | 'holiday' {
  // Сначала проверяем, является ли день праздничным
  if (holidayDays.has(dayNum)) {
    return 'holiday';
  }

  try {
    const date = DateTime.fromObject({ year, month, day: dayNum });
    const weekday = date.weekday; // 1=Monday, 7=Sunday
    
    if (weekday === 6) return 'sat';
    if (weekday === 7) return 'sun';
    return 'weekday';
  } catch {
    return 'weekday';
  }
}

function tryFloat(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && isNaN(val)) return null;
  
  try {
    const s = String(val).trim().replace(',', '.');
    if (!s) return null;
    const num = parseFloat(s);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}


function bufferStartsWith(buf: Buffer, signature: number[]): boolean {
  if (!buf || buf.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buf[i] !== signature[i]) return false;
  }
  return true;
}

function detectExcelFormat(buf: Buffer): 'xlsx' | 'xls' | 'unknown' {
  const xlsSig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const zipSigs = [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ];

  if (bufferStartsWith(buf, xlsSig)) return 'xls';
  if (zipSigs.some((sig) => bufferStartsWith(buf, sig))) return 'xlsx';
  return 'unknown';
}

function ensureBuffer(input: any): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(input);
}

async function loadWorkbookFromBuffer(fileBuffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const format = detectExcelFormat(fileBuffer);

  if (format === 'xlsx') {
    await workbook.xlsx.load(fileBuffer);
    return workbook;
  }

  if (format === 'xls') {
    const legacy = XLSX.read(fileBuffer, { type: 'buffer' });
    const xlsxBuffer = ensureBuffer(
      XLSX.write(legacy, { type: 'buffer', bookType: 'xlsx' })
    );
    await workbook.xlsx.load(xlsxBuffer);
    return workbook;
  }

  try {
    await workbook.xlsx.load(fileBuffer);
    return workbook;
  } catch {
    try {
      const legacy = XLSX.read(fileBuffer, { type: 'buffer' });
      const xlsxBuffer = ensureBuffer(
        XLSX.write(legacy, { type: 'buffer', bookType: 'xlsx' })
      );
      await workbook.xlsx.load(xlsxBuffer);
      return workbook;
    } catch {
      throw new Error('Файл табеля должен быть в формате .xlsx или .xls (Excel 97-2003).');
    }
  }
}

function normalizeHeader(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function findDepartmentColumn(headerRow: ExcelJS.Row): number | null {
  const keys = [
    'отдел',
    'отделение',
    'подраздел',
    'подразделение',
    'департамент',
    'department',
    'dept',
    'бөлім',
    'болим',
    'бөлімше',
    'болимше',
  ];

  for (let j = 1; j <= headerRow.cellCount; j++) {
    const header = normalizeHeader(headerRow.getCell(j).value);
    if (!header) continue;
    if (keys.some((k) => header.includes(k))) {
      return j;
    }
  }

  return null;
}

export async function parseTimesheet(
  fileBuffer: Buffer,
  year: number,
  month: number,
  holidays: (string | number)[] = [],
  options?: { dayFrom?: number; dayTo?: number }
): Promise<ParsedEmployee[]> {
  const holidayDays = normalizeHolidays(holidays, year, month);
  const workbook = await loadWorkbookFromBuffer(fileBuffer);

  // Try to find Kazakh template first
  let worksheet = workbook.worksheets[0];
  let headerRowIdx: number | null = null;

  // Find "АТЫ-жөні (толығымен)" header
  for (let i = 0; i < worksheet.rowCount; i++) {
    const row = worksheet.getRow(i + 1);
    for (let j = 1; j <= worksheet.columnCount; j++) {
      const cell = row.getCell(j);
      const value = String(cell.value || '').trim();
      if (value === 'АТЫ-жөні (толығымен)') {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx !== null) break;
  }

  if (headerRowIdx !== null) {
    return parseKazakhTemplate(worksheet, headerRowIdx, year, month, holidayDays, options);
  }

  // Try simple template with "Сотрудник" column
  worksheet = workbook.worksheets[0];
  const headerRow = worksheet.getRow(1);
  let hasEmployeeCol = false;
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    if (String(cell.value || '').trim() === 'Сотрудник') {
      hasEmployeeCol = true;
      break;
    }
  }

  if (hasEmployeeCol) {
    return parseSimpleTemplate(worksheet, year, month, holidayDays, options);
  }

  throw new Error(
    'Не удалось определить формат табеля. Нет ни заголовка "АТЫ-жөні (толығымен)", ни колонки "Сотрудник".'
  );
}

function parseKazakhTemplate(
  worksheet: ExcelJS.Worksheet,
  headerRowIdx: number,
  year: number,
  month: number,
  holidayDays: Set<number>,
  options?: { dayFrom?: number; dayTo?: number }
): ParsedEmployee[] {
  const headerRow = worksheet.getRow(headerRowIdx + 1);
  let fioCol: number | null = null;
  const deptCol = findDepartmentColumn(headerRow);

  // Find FIO column
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    if (String(cell.value || '').trim() === 'АТЫ-жөні (толығымен)') {
      fioCol = j;
      break;
    }
  }

  if (!fioCol) {
    throw new Error('Не найдена колонка с ФИО');
  }

  // Day header row (next after header)
  const dayHeaderRow = worksheet.getRow(headerRowIdx + 2);
  const dayCols: Array<{ col: number; day: number }> = [];

  const dayFrom = options?.dayFrom ?? 1;
  const dayTo = options?.dayTo ?? 31;

  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = dayHeaderRow.getCell(j);
    const value = String(cell.value || '').trim();
    if (/^\d+$/.test(value)) {
      const day = parseInt(value);
      if (day >= dayFrom && day <= dayTo) {
        dayCols.push({ col: j, day });
      }
    }
  }

  const employees: ParsedEmployee[] = [];

  // Process employee rows
  for (let i = headerRowIdx + 2; i < worksheet.rowCount; i++) {
    const row = worksheet.getRow(i + 1);
    const fioCell = row.getCell(fioCol);
    const fioRaw = fioCell.value;

    if (!fioRaw || String(fioRaw).trim() === '' || String(fioRaw).trim() === 'АТЫ-жөні (толығымен)') {
      continue;
    }

    const fio = String(fioRaw).trim();
    if (!fio) continue;

    const department =
      deptCol ? String(row.getCell(deptCol).value || '').trim() || undefined : undefined;

    const emp: ParsedEmployee = {
      fio,
      department,
      letters_weekday: 0,
      letters_sat: 0,
      letters_sun: 0,
      letters_holiday: 0,
      numbers_weekday: 0,
      numbers_sat: 0,
      numbers_sun: 0,
      numbers_holiday: 0,
      dayValues: [],
    };

    // Process day columns
    for (const { col, day } of dayCols) {
      const cell = row.getCell(col);
      const val = cell.value;
      const rawStr = val === null || val === undefined ? '' : String(val).trim();

      const dayType = classifyDay(year, month, day, holidayDays);

      // Always record the day value (even empty)
      const skip = !rawStr || rawStr === '-' || rawStr.toUpperCase() === 'В';
      emp.dayValues!.push({
        day,
        month,
        year,
        value: rawStr || (rawStr.toUpperCase() === 'В' ? 'В' : ''),
        dayType,
        isNumber: false,
      });

      if (skip) continue;

      const num = tryFloat(rawStr);
      const isNumber = num !== null;
      // Update last dayValue with correct isNumber
      emp.dayValues![emp.dayValues!.length - 1].isNumber = isNumber;

      if (isNumber) {
        if (dayType === 'weekday') emp.numbers_weekday++;
        else if (dayType === 'sat') emp.numbers_sat++;
        else if (dayType === 'sun') emp.numbers_sun++;
        else emp.numbers_holiday++;
      } else {
        if (dayType === 'weekday') emp.letters_weekday++;
        else if (dayType === 'sat') emp.letters_sat++;
        else if (dayType === 'sun') emp.letters_sun++;
        else emp.letters_holiday++;
      }
    }

    employees.push(emp);
  }

  return employees;
}

function parseSimpleTemplate(
  worksheet: ExcelJS.Worksheet,
  year: number,
  month: number,
  holidayDays: Set<number>,
  options?: { dayFrom?: number; dayTo?: number }
): ParsedEmployee[] {
  const headerRow = worksheet.getRow(1);
  let employeeCol: number | null = null;
  const departmentCol = findDepartmentColumn(headerRow);
  const dayCols: Array<{ col: number; day: number }> = [];
  const dayFrom = options?.dayFrom ?? 1;
  const dayTo = options?.dayTo ?? 31;

  // Find columns
  for (let j = 1; j <= worksheet.columnCount; j++) {
    const cell = headerRow.getCell(j);
    const header = String(cell.value || '').trim();

    if (header === 'Сотрудник') {
      employeeCol = j;
    } else if (header.length === 2 && /^\d{2}$/.test(header)) {
      const day = parseInt(header);
      if (day >= dayFrom && day <= dayTo) {
        dayCols.push({ col: j, day });
      }
    }
  }

  if (!employeeCol) {
    throw new Error('Не найдена колонка "Сотрудник"');
  }

  const employees: ParsedEmployee[] = [];

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const fioCell = row.getCell(employeeCol);
    const fio = String(fioCell.value || '').trim();

    if (!fio) continue;

    const emp: ParsedEmployee = {
      fio,
      department: departmentCol ? String(row.getCell(departmentCol).value || '').trim() || undefined : undefined,
      letters_weekday: 0,
      letters_sat: 0,
      letters_sun: 0,
      letters_holiday: 0,
      numbers_weekday: 0,
      numbers_sat: 0,
      numbers_sun: 0,
      numbers_holiday: 0,
      dayValues: [],
    };

    for (const { col, day } of dayCols) {
      const cell = row.getCell(col);
      const val = cell.value;
      const rawStr = val === null || val === undefined ? '' : String(val).trim();

      const dayType = classifyDay(year, month, day, holidayDays);
      const skip = !rawStr || rawStr === '-' || rawStr.toUpperCase() === 'В';

      emp.dayValues!.push({
        day,
        month,
        year,
        value: rawStr || '',
        dayType,
        isNumber: false,
      });

      if (skip) continue;

      const num = tryFloat(rawStr);
      const isNumber = num !== null;
      emp.dayValues![emp.dayValues!.length - 1].isNumber = isNumber;

      if (isNumber) {
        if (dayType === 'weekday') emp.numbers_weekday++;
        else if (dayType === 'sat') emp.numbers_sat++;
        else if (dayType === 'sun') emp.numbers_sun++;
        else emp.numbers_holiday++;
      } else {
        if (dayType === 'weekday') emp.letters_weekday++;
        else if (dayType === 'sat') emp.letters_sat++;
        else if (dayType === 'sun') emp.letters_sun++;
        else emp.letters_holiday++;
      }
    }

    employees.push(emp);
  }

  return employees;
}
