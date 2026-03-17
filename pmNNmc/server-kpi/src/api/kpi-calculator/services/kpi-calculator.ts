interface Employee {
    id: number;
    fio: string;
    kpiSum: number;
    scheduleType: string;
    department: string;
    categoryCode?: string;
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
  }
  
  interface KPIResult {
    fio: string;
    scheduleType: string;
    department: string;
    daysAssigned: number;
    daysWorked: number;
    notWorked: number;
    lettersWeekday: number;
    lettersSat: number;
    lettersSun: number;
    lettersHoliday: number;
    numbersWeekday: number;
    numbersSat: number;
    numbersSun: number;
    numbersHoliday: number;
    workPercent: number;
    kpiSum: number;
    kpiFinal: number;
  }
  
  interface KPIError {
    fio: string;
    type: string;
    details: string;
  }
  
  export function mergeEmployees(
    prevParsed: ParsedEmployee[],
    currParsed: ParsedEmployee[]
  ): ParsedEmployee[] {
    const map = new Map<string, ParsedEmployee>();

    const addToMap = (emp: ParsedEmployee) => {
      const key = String(emp.fio || '').trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.letters_weekday += emp.letters_weekday || 0;
        existing.letters_sat += emp.letters_sat || 0;
        existing.letters_sun += emp.letters_sun || 0;
        existing.letters_holiday += emp.letters_holiday || 0;
        existing.numbers_weekday += emp.numbers_weekday || 0;
        existing.numbers_sat += emp.numbers_sat || 0;
        existing.numbers_sun += emp.numbers_sun || 0;
        existing.numbers_holiday += emp.numbers_holiday || 0;
      } else {
        map.set(key, {
          fio: emp.fio,
          department: emp.department,
          letters_weekday: emp.letters_weekday || 0,
          letters_sat: emp.letters_sat || 0,
          letters_sun: emp.letters_sun || 0,
          letters_holiday: emp.letters_holiday || 0,
          numbers_weekday: emp.numbers_weekday || 0,
          numbers_sat: emp.numbers_sat || 0,
          numbers_sun: emp.numbers_sun || 0,
          numbers_holiday: emp.numbers_holiday || 0,
        });
      }
    };

    for (const emp of prevParsed) addToMap(emp);
    for (const emp of currParsed) addToMap(emp);

    return Array.from(map.values());
  }

  export function calculateKPI(
    employees: ParsedEmployee[],
    kpiTable: Employee[],
    nchDay: number,
    ndShift: number
  ): { results: KPIResult[]; errors: KPIError[] } {
    // Create map: fio (lowercase) -> employee
    const kpiMap = new Map<string, Employee>();
    kpiTable.forEach((item) => {
      const key = String(item.fio || '').trim().toLowerCase();
      if (key) {
        kpiMap.set(key, item);
      }
    });
  
    const seen = new Set<string>();
    const results: KPIResult[] = [];
    const errors: KPIError[] = [];
  
    for (const emp of employees) {
      const fio = String(emp.fio || '').trim();
      if (!fio) continue;
  
      const fioKey = fio.toLowerCase();
  
      // Check duplicates
      if (seen.has(fioKey)) {
        errors.push({
          fio,
          type: 'DUPLICATE',
          details: 'ФИО повторяется в табеле',
        });
        continue;
      }
      seen.add(fioKey);
  
      const kpiInfo = kpiMap.get(fioKey);
      if (!kpiInfo) {
        errors.push({
          fio,
          type: 'NO_KPI_MAPPING',
          details: 'Нет записи в KPI таблице',
        });
        continue;
      }
  
      // Exclude students (categoryCode == "4")
      if (String(kpiInfo.categoryCode || '').trim() === '4') {
        errors.push({
          fio,
          type: 'STUDENT',
          details: 'CategoryCode = 4 (студент), KPI не считается',
        });
        continue;
      }
  
      const scheduleType = String(kpiInfo.scheduleType || '').trim().toLowerCase();
      const kpiSum = parseFloat(String(kpiInfo.kpiSum || 0)) || 0;
  
      if (scheduleType === 'day') {
        const daysAssigned = nchDay;
        if (daysAssigned <= 0) {
          errors.push({
            fio,
            type: 'INVALID_PLAN',
            details: 'Н.ч (назначено дней) <= 0',
          });
          continue;
        }
  
        const notWorked = emp.letters_weekday || 0;
        let daysWorked = daysAssigned - notWorked;
  
        // Normalize
        if (daysWorked < 0) daysWorked = 0;
        if (daysWorked > daysAssigned) daysWorked = daysAssigned;
  
        let workPercent = (daysWorked / daysAssigned) * 100;
        if (workPercent > 100) workPercent = 100;
        if (workPercent < 0) workPercent = 0;
  
        const kpiFinal = (workPercent / 100) * kpiSum;
  
        results.push({
          fio,
          scheduleType: 'day',
          department: kpiInfo.department || '',
          daysAssigned,
          daysWorked,
          notWorked: Math.max(daysAssigned - daysWorked, 0),
          lettersWeekday: emp.letters_weekday || 0,
          lettersSat: emp.letters_sat || 0,
          lettersSun: emp.letters_sun || 0,
          lettersHoliday: emp.letters_holiday || 0,
          numbersWeekday: emp.numbers_weekday || 0,
          numbersSat: emp.numbers_sat || 0,
          numbersSun: emp.numbers_sun || 0,
          numbersHoliday: emp.numbers_holiday || 0,
          workPercent: Math.round(workPercent * 100) / 100,
          kpiSum,
          kpiFinal: Math.round(kpiFinal * 100) / 100,
        });
      } else {
        // shift schedule
        const daysAssigned = ndShift;
        if (daysAssigned <= 0) {
          errors.push({
            fio,
            type: 'INVALID_PLAN',
            details: 'Н.д (назначено суточных) <= 0',
          });
          continue;
        }
  
        const notWorked = (emp.letters_weekday || 0) + (emp.letters_sat || 0);
        let daysWorked = daysAssigned - notWorked;
  
        if (daysWorked < 0) daysWorked = 0;
        if (daysWorked > daysAssigned) daysWorked = daysAssigned;
  
        let workPercent = (daysWorked / daysAssigned) * 100;
        if (workPercent > 100) workPercent = 100;
        if (workPercent < 0) workPercent = 0;
  
        const kpiFinal = (workPercent / 100) * kpiSum;
  
        results.push({
          fio,
          scheduleType: 'shift',
          department: kpiInfo.department || '',
          daysAssigned,
          daysWorked,
          notWorked,
          lettersWeekday: emp.letters_weekday || 0,
          lettersSat: emp.letters_sat || 0,
          lettersSun: emp.letters_sun || 0,
          lettersHoliday: emp.letters_holiday || 0,
          numbersWeekday: emp.numbers_weekday || 0,
          numbersSat: emp.numbers_sat || 0,
          numbersSun: emp.numbers_sun || 0,
          numbersHoliday: emp.numbers_holiday || 0,
          workPercent: Math.round(workPercent * 100) / 100,
          kpiSum,
          kpiFinal: Math.round(kpiFinal * 100) / 100,
        });
      }
    }
  
  return { results, errors };
}

export type { Employee, ParsedEmployee, KPIResult, KPIError };