/**
 * KpiTimesheetModule
 *
 * Embedded KPI Timesheet module for pmNNmc.
 * This is an adapted version of kpiServer's App.jsx:
 * - Login form removed (handled by KpiTimesheetPage.tsx)
 * - Top navigation header removed (pmNNmc sidebar is used instead)
 * - CSS scoped under .kpi-wrapper to avoid Tailwind conflicts
 * - API calls routed to kpiServer backend via kpiApi.js
 *
 * Props:
 *   user        — { login, role, allowedDepartments } from KpiTimesheetPage
 *   onKpiLogout — callback to clear kpi_token and return to login form
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  apiCalcKpiJson,
  apiCalcKpiExcel,
  apiCalcKpiBuhPdf,
  apiKpiList,
  apiDeletedLog,
  apiEditedLog,
  apiRestoredLog,
  apiAddEmployee,
  apiEditEmployee,
  apiDeleteEmployee,
  apiRestoreEmployee,
  apiHolidays,
  apiAccessUsers,
  apiUpdateUserAccess,
} from "./kpiApi";
import "./kpi.css";

const STORAGE_CACHE_KEY = "kpi_cache_v1";

const safeParseJSON = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isUnauthorizedError = (value) => {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("401") ||
    text.includes("unauthorized") ||
    text.includes("missing or invalid credentials")
  );
};

/** Calculate working days for the 25-25 period (25 prevMonth .. 25 currentMonth) */
const calcWorkdaysForPeriod = (year, month, allHolidays) => {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || !m || m < 1 || m > 12) return { day: 0, shift: 25 };

  let prevMonth = m - 1;
  let prevYear = y;
  if (prevMonth < 1) { prevMonth = 12; prevYear = y - 1; }

  // Build set of holiday date strings for both months
  const holidaySet = new Set();
  (allHolidays || []).forEach((h) => {
    const d = h?.date || h;
    if (d) holidaySet.add(String(d));
  });
  // Also add static holidays for prev month
  const prevStaticItems = STATIC_HOLIDAYS[prevMonth] || [];
  prevStaticItems.forEach((item) => {
    holidaySet.add(buildHolidayDate(prevYear, prevMonth, item.day));
  });

  let weekdays = 0;
  // Days 25..end of prev month
  const lastDayPrev = new Date(prevYear, prevMonth, 0).getDate();
  for (let d = 25; d <= lastDayPrev; d++) {
    const date = new Date(prevYear, prevMonth - 1, d);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    const dateStr = buildHolidayDate(prevYear, prevMonth, d);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) weekdays++;
  }
  // Days 1..25 of current month
  for (let d = 1; d <= 25; d++) {
    const date = new Date(y, m - 1, d);
    const dow = date.getDay();
    const dateStr = buildHolidayDate(y, m, d);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) weekdays++;
  }

  return { day: weekdays, shift: 25 };
};

const MONTH_SELECT_NAMES = [
  "январь","февраль","март","апрель","май","июнь",
  "июль","август","сентябрь","октябрь","ноябрь","декабрь",
];

const STATIC_HOLIDAYS = {
  1: [
    { day: 1, label: "Новый год" },
    { day: 2, label: "Новый год" },
    { day: 7, label: "Православное Рождество" },
  ],
  3: [
    { day: 8, label: "Международный женский день" },
    { day: 21, label: "Наурыз мейрамы" },
    { day: 22, label: "Наурыз мейрамы" },
    { day: 23, label: "Наурыз мейрамы" },
  ],
  5: [
    { day: 1, label: "Праздник единства народа Казахстана" },
    { day: 7, label: "День защитника Отечества" },
    { day: 9, label: "День Победы" },
    { day: 27, label: "Курбан айт" },
  ],
  7: [{ day: 6, label: "День Столицы" }],
  8: [{ day: 30, label: "День Конституции РК" }],
  10: [{ day: 25, label: "День Республики" }],
  12: [{ day: 16, label: "День Независимости" }],
};

const buildHolidayDate = (year, month, day) => {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const getStaticHolidays = (year, month) => {
  const items = STATIC_HOLIDAYS[month] || [];
  return items.map((item) => ({
    date: buildHolidayDate(year, month, item.day),
    description: item.label || "",
    isStatic: true,
  }));
};

const mergeHolidays = (apiItems, staticItems) => {
  const byDate = new Map();
  (staticItems || []).forEach((item) => {
    if (!item?.date) return;
    byDate.set(item.date, { ...item });
  });
  (apiItems || []).forEach((item) => {
    if (!item?.date) return;
    const existing = byDate.get(item.date);
    if (existing) {
      byDate.set(item.date, { ...existing, ...item, description: item.description || existing.description, isStatic: existing.isStatic || item.isStatic });
    } else {
      byDate.set(item.date, { ...item });
    }
  });
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );
};

// ======================= Toast =======================

function Toast({ message, onClose }) {
  if (!message) return null;
  const bg = message.type === "error" ? "rgba(248,113,113,0.95)" : "rgba(52,211,153,0.95)";
  return (
    <div className="kpi-toast-overlay" onClick={onClose}>
      <div className="kpi-toast-popup" style={{ backgroundColor: bg }} onClick={(e) => e.stopPropagation()}>
        <div className="kpi-toast-text">{message.text}</div>
        <button className="kpi-toast-btn" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

// ======================= Модалка удаления =======================

function DeleteConfirmModal({ employee, onCancel, onConfirm }) {
  const [reason, setReason] = useState("Уволился");
  useEffect(() => { setReason("Уволился"); }, [employee]);
  if (!employee) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Удаление сотрудника</h3>
        <p className="modal-text">Вы действительно хотите удалить сотрудника <strong>{employee.fio}</strong> из справочника KPI?</p>
        <p className="modal-subtext">Укажите причину удаления — она будет записана в Excel-лог.</p>
        <label className="modal-label">
          Причина:
          <select className="modal-select" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="Уволился">Уволился</option>
            <option value="Добавлен ошибочно">Добавлен ошибочно</option>
            <option value="Переведён в другое отделение">Переведён в другое отделение</option>
            <option value="Другое">Другое</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Отмена</button>
          <button className="btn btn-danger" onClick={() => onConfirm(employee, reason)}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

// ======================= Форма сотрудника =======================

function EmployeeFormModal({ initial, mode, onCancel, onSave }) {
  const [fio, setFio] = useState(initial?.fio || "");
  const [kpiSum, setKpiSum] = useState(initial?.kpiSum || 11000);
  const [scheduleType, setScheduleType] = useState(initial?.scheduleType || "day");
  const [department, setDepartment] = useState(initial?.department || "");
  const [categoryCode, setCategoryCode] = useState(initial?.categoryCode || "");

  useEffect(() => {
    if (!initial) return;
    setFio(initial.fio || "");
    setKpiSum(initial.kpiSum || 11000);
    setScheduleType(initial.scheduleType || "day");
    setDepartment(initial.department || "");
    setCategoryCode(initial.categoryCode || "");
  }, [initial]);

  if (!mode) return null;
  const isEdit = mode === "edit";

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ id: initial?.id, fio: fio.trim(), kpiSum: Number(kpiSum), scheduleType, department: department.trim(), categoryCode: categoryCode.trim() });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isEdit ? "Редактирование сотрудника" : "Добавление сотрудника"}</h3>
        <p className="modal-subtext">Укажите ФИО строго так же, как в удостоверении личности или в 1С.</p>
        <form onSubmit={handleSubmit} className="employee-form">
          <label className="modal-label">
            ФИО *
            <input className="modal-input" value={fio} onChange={(e) => setFio(e.target.value)} placeholder="Фамилия Имя Отчество" required />
          </label>
          <label className="modal-label">
            KPI сумм (тенге) *
            <input type="number" min={0} step={100} className="modal-input" value={kpiSum} onChange={(e) => setKpiSum(e.target.value)} required />
          </label>
          <label className="modal-label">
            График *
            <select className="modal-select" value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} required>
              <option value="day">Дневные</option>
              <option value="shift">Суточные</option>
            </select>
          </label>
          <label className="modal-label">
            Отделение *
            <input className="modal-input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Например, ОЦМК-2" required />
          </label>
          <label className="modal-label">
            Категория (код)
            <input className="modal-input" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} placeholder="Необязательно" />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Отмена</button>
            <button type="submit" className="btn btn-primary">{isEdit ? "Сохранить" : "Добавить"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ======================= Модалка доступа =======================

function AccessModal({ user, departments, onCancel, onSave }) {
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    if (!user) return;
    setSelected(Array.isArray(user.allowedDepartments) ? user.allowedDepartments : []);
  }, [user]);

  if (!user) return null;
  const toggleDept = (dept) => setSelected((prev) => prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]);
  const allDepts = Array.isArray(departments) ? departments : [];

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Доступ к отделам</h3>
        <p className="modal-subtext">Пользователь: <strong>{user.username || user.email}</strong></p>
        {allDepts.length === 0 ? (
          <div className="empty-state">Нет отделов для настройки.</div>
        ) : (
          <div className="dept-grid">
            {allDepts.map((dept) => (
              <label key={dept} className="dept-chip">
                <input type="checkbox" checked={selected.includes(dept)} onChange={() => toggleDept(dept)} />
                <span>{dept}</span>
              </label>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Отмена</button>
          <button className="btn btn-primary" onClick={() => onSave(user, selected)}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

// ======================= Основной модуль =======================

export default function KpiTimesheetModule({ user, onKpiLogout }) {
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("calc");
  const [toast, setToast] = useState(null);

  const [timesheetFile, setTimesheetFile] = useState(null);
  const [timesheetFilePrev, setTimesheetFilePrev] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDragActivePrev, setIsDragActivePrev] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  const [nchDayOverride, setNchDayOverride] = useState(null);
  const [ndShiftOverride, setNdShiftOverride] = useState(null);

  const [holidays, setHolidays] = useState([]);
  const [calcResults, setCalcResults] = useState([]);
  const [parsedDetails, setParsedDetails] = useState([]);
  const [calcErrors, setCalcErrors] = useState([]);
  const [calcDepartment, setCalcDepartment] = useState("");

  const [kpiItems, setKpiItems] = useState([]);
  const [deletedItems, setDeletedItems] = useState([]);
  const [editedItems, setEditedItems] = useState([]);
  const [restoredItems, setRestoredItems] = useState([]);

  const [kpiTab, setKpiTab] = useState("list");
  const [filterSchedule, setFilterSchedule] = useState("all");
  const [filterDept, setFilterDept] = useState("");
  const [searchFio, setSearchFio] = useState("");
  const [sortBy, setSortBy] = useState("fio");

  const [deleteModalEmployee, setDeleteModalEmployee] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [formInitial, setFormInitial] = useState(null);

  const [accessUsers, setAccessUsers] = useState([]);
  const [accessModalUser, setAccessModalUser] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const isAdmin =
    String(user?.role || "").toLowerCase().includes("admin") ||
    String(user?.login || "").toLowerCase().startsWith("admin");

  // Auto-calculate working days for 25-25 period
  const autoWorkdays = useMemo(() => calcWorkdaysForPeriod(year, month, holidays), [year, month, holidays]);
  const nchDay = nchDayOverride !== null ? String(nchDayOverride) : String(autoWorkdays.day);
  const ndShift = ndShiftOverride !== null ? String(ndShiftOverride) : String(autoWorkdays.shift);

  // Reset overrides when month/year changes
  useEffect(() => { setNchDayOverride(null); setNdShiftOverride(null); }, [month, year]);

  // Previous month name for labels
  const prevMonthInfo = useMemo(() => {
    const m = parseInt(month, 10);
    let pm = m - 1, py = parseInt(year, 10);
    if (pm < 1) { pm = 12; py--; }
    return { month: pm, year: py, name: MONTH_SELECT_NAMES[pm - 1] || "" };
  }, [month, year]);
  const currMonthName = MONTH_SELECT_NAMES[parseInt(month, 10) - 1] || "";

  const showToast = (text, type = "success") => setToast({ text, type });

  const handleLogout = () => {
    localStorage.removeItem("kpi_cache_v1");
    if (onKpiLogout) onKpiLogout();
  };

  // Загрузка кэша
  useEffect(() => {
    const cached = safeParseJSON(localStorage.getItem(STORAGE_CACHE_KEY));
    if (cached && typeof cached === "object") {
      if (cached.activeTab) setActiveTab(String(cached.activeTab));
      if (cached.month) setMonth(String(cached.month));
      if (cached.year) setYear(String(cached.year));
      if (cached.calcDepartment) setCalcDepartment(String(cached.calcDepartment));
      if (Array.isArray(cached.calcResults)) setCalcResults(cached.calcResults);
      if (Array.isArray(cached.calcErrors)) setCalcErrors(cached.calcErrors);
      if (cached.kpiTab) setKpiTab(String(cached.kpiTab));
      if (cached.filterSchedule) setFilterSchedule(String(cached.filterSchedule));
      if (cached.filterDept) setFilterDept(String(cached.filterDept));
      if (cached.searchFio) setSearchFio(String(cached.searchFio));
      if (cached.sortBy) setSortBy(String(cached.sortBy));
    }
    setCacheLoaded(true);
  }, []);

  // Сохранение кэша
  useEffect(() => {
    if (!cacheLoaded) return;
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify({
      activeTab, month, year, calcDepartment, calcResults, calcErrors,
      kpiTab, filterSchedule, filterDept, searchFio, sortBy,
    }));
  }, [cacheLoaded, activeTab, month, year, calcDepartment, calcResults, calcErrors, kpiTab, filterSchedule, filterDept, searchFio, sortBy]);

  // Загрузка праздников
  useEffect(() => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m) return;
    const staticList = getStaticHolidays(y, m);
    apiHolidays(y, m)
      .then((list) => setHolidays(mergeHolidays(list || [], staticList)))
      .catch(() => setHolidays(mergeHolidays([], staticList)));
  }, [year, month]);

  // Загрузка справочника
  const reloadKpiAll = async () => {
    const [listRes, delRes, editRes, restRes] = await Promise.allSettled([
      apiKpiList(), apiDeletedLog(), apiEditedLog(), apiRestoredLog(),
    ]);
    if (listRes.status === "fulfilled") {
      setKpiItems(listRes.value.items || listRes.value || []);
    } else {
      const msg = listRes.reason instanceof Error ? listRes.reason.message : String(listRes.reason || "");
      if (isUnauthorizedError(msg)) { handleLogout(); showToast("Сессия истекла. Войдите заново.", "error"); return; }
      setKpiItems([]);
      showToast(msg || "Ошибка загрузки списка сотрудников", "error");
    }
    setDeletedItems(delRes.status === "fulfilled" ? delRes.value.items || delRes.value || [] : []);
    setEditedItems(editRes.status === "fulfilled" ? editRes.value.items || editRes.value || [] : []);
    setRestoredItems(restRes.status === "fulfilled" ? restRes.value.items || restRes.value || [] : []);
  };

  const loadAccessUsers = async () => {
    if (!isAdmin) return;
    setAccessLoading(true);
    try {
      const res = await apiAccessUsers();
      setAccessUsers(res.items || res || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isUnauthorizedError(msg)) { handleLogout(); showToast("Сессия истекла. Войдите заново.", "error"); return; }
      showToast(msg || "Ошибка загрузки доступов", "error");
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => { if (user) reloadKpiAll(); }, [user]);
  useEffect(() => { if (user && isAdmin) loadAccessUsers(); }, [user, isAdmin]);

  // Фильтрация
  const normalizeDept = (value) => String(value || "").trim().toUpperCase().replace(/[\s\-–—_]+/g, "");
  const filterResultsByDept = (items, dept) => {
    if (!dept) return items || [];
    const target = normalizeDept(dept);
    return (items || []).filter((r) => normalizeDept(r?.department) === target);
  };

  const filteredKpiItems = kpiItems
    .filter((item) => {
      if (filterSchedule === "day" && item.scheduleType !== "day") return false;
      if (filterSchedule === "shift" && item.scheduleType !== "shift") return false;
      if (filterDept && item.department !== filterDept) return false;
      if (searchFio && !String(item.fio || "").toLowerCase().includes(searchFio.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "id") return (a.id || 0) - (b.id || 0);
      return String(a.fio || "").toLowerCase().localeCompare(String(b.fio || "").toLowerCase(), "ru");
    });

  const allDepartments = useMemo(
    () => Array.from(new Set(kpiItems.map((x) => x.department || "").filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "ru")),
    [kpiItems]
  );

  useEffect(() => {
    if (!user || !allDepartments || allDepartments.length === 0) { setCalcDepartment(""); return; }
    if (!calcDepartment || !allDepartments.includes(calcDepartment)) setCalcDepartment(allDepartments[0] || "");
  }, [user, allDepartments]);

  useEffect(() => {
    if (!allDepartments || allDepartments.length === 0) { setCalcDepartment(""); return; }
    if (!filterDept) { setCalcDepartment(allDepartments[0] || ""); return; }
    if (allDepartments.includes(filterDept)) setCalcDepartment(filterDept);
  }, [filterDept, allDepartments]);

  useEffect(() => { setCalcResults([]); setCalcErrors([]); setParsedDetails([]); }, [calcDepartment, timesheetFile, timesheetFilePrev]);

  const normalizeCalcError = (item) => {
    if (!item) return { fio: "", type: "", message: "Неизвестная ошибка" };
    if (typeof item === "string") return { fio: "", type: "", message: item };
    if (typeof item === "object") {
      const fio = item.fio ? String(item.fio) : "";
      const type = item.type ? String(item.type) : "";
      const message = item.details || item.message || item.error || (typeof item.info === "string" ? item.info : "");
      if (message) return { fio, type, message: String(message) };
      try { return { fio, type, message: JSON.stringify(item) }; } catch { return { fio, type, message: String(item) }; }
    }
    return { fio: "", type: "", message: String(item) };
  };

  const calcIssues = (calcErrors || []).map(normalizeCalcError);

  const formatScheduleType = (value) => {
    const key = String(value || "").trim().toLowerCase();
    if (key === "day") return "Дневные";
    if (key === "shift") return "Суточные";
    return value || "";
  };

  const formatChange = (oldVal, newVal) => {
    const oldStr = oldVal === undefined || oldVal === null ? "" : String(oldVal);
    const newStr = newVal === undefined || newVal === null ? "" : String(newVal);
    if (!oldStr && !newStr) return "";
    if (oldStr === newStr) return oldStr;
    return `${oldStr || "—"} → ${newStr || "—"}`;
  };

  const handleTimesheetFile = (file, isPrev = false) => {
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
      showToast("Допустимы только файлы XLSX/XLS", "error");
      return;
    }
    if (isPrev) setTimesheetFilePrev(file);
    else setTimesheetFile(file);
  };

  const handleCalc = async () => {
    if (!timesheetFile) { showToast("Выберите файл табеля текущего месяца", "error"); return; }
    if (!timesheetFilePrev) { showToast("Выберите файл табеля прошлого месяца", "error"); return; }
    if (!calcDepartment) { showToast("Выберите отдел для расчёта", "error"); return; }
    try {
      const fd = new FormData();
      fd.append("timesheet", timesheetFile);
      fd.append("timesheetPrev", timesheetFilePrev);
      fd.append("nchDay", nchDay || "0");
      fd.append("ndShift", ndShift || "0");
      fd.append("year", year);
      fd.append("month", month);
      if (calcDepartment) fd.append("department", calcDepartment);
      fd.append("debug", "1");
      fd.append("holidays", JSON.stringify(holidays.map((h) => h.date || h).filter(Boolean)));
      const data = await apiCalcKpiJson(fd, { department: calcDepartment || "", debug: true });
      const filteredResults = filterResultsByDept(data.results || [], calcDepartment);
      setCalcResults(filteredResults);
      setCalcErrors(data.errors || []);
      setParsedDetails(data.parsedDetails || []);
      const deptError = (data.errors || []).find((e) => e && (e.type === "NO_EMPLOYEES" || e.type === "NO_DEPARTMENT_COLUMN"));
      if (deptError) showToast(deptError.details || "Нет сотрудников в выбранном отделе", "error");
      else if (calcDepartment && filteredResults.length === 0) showToast(`Нету никого в отделе ${calcDepartment}`, "error");
      else { showToast("Расчёт KPI выполнен"); setActiveTab("results"); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка расчёта KPI", "error");
    }
  };

  const handleDownload = async (mode) => {
    if (!timesheetFile) { showToast("Выберите файл табеля текущего месяца", "error"); return; }
    if (!timesheetFilePrev) { showToast("Выберите файл табеля прошлого месяца", "error"); return; }
    if (!calcDepartment) { showToast("Выберите отдел для расчёта", "error"); return; }
    try {
      const fd = new FormData();
      fd.append("timesheet", timesheetFile);
      fd.append("timesheetPrev", timesheetFilePrev);
      fd.append("nchDay", nchDay || "0");
      fd.append("ndShift", ndShift || "0");
      fd.append("year", year);
      fd.append("month", month);
      if (calcDepartment) fd.append("department", calcDepartment);
      fd.append("holidays", JSON.stringify(holidays.map((h) => h.date || h).filter(Boolean)));
      const blob = mode === "pdf"
        ? await apiCalcKpiBuhPdf(fd, { department: calcDepartment || "", debug: true })
        : await apiCalcKpiExcel(fd, mode, { department: calcDepartment || "", debug: true });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = mode === "1c" ? `KPI_for_1C_${ts}.xlsx` : mode === "buh" ? `KPI_for_Buh_${ts}.xlsx` : mode === "pdf" ? `KPI_for_Buh_${ts}.pdf` : `KPIfinal_${ts}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(mode === "pdf" ? "Файл PDF сформирован и скачан" : "Файл Excel сформирован и скачан");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка формирования файла", "error");
    }
  };

  const openAddForm = () => { setFormInitial(null); setFormMode("add"); };
  const openEditForm = (item) => { setFormInitial(item); setFormMode("edit"); };
  const openAccessModal = (accessUser) => setAccessModalUser(accessUser);

  const handleAccessSave = async (accessUser, departments) => {
    if (!accessUser) return;
    try {
      await apiUpdateUserAccess(accessUser.id, departments || []);
      setAccessUsers(accessUsers.map((u) => u.id === accessUser.id ? { ...u, allowedDepartments: departments || [] } : u));
      showToast("Доступы обновлены");
      setAccessModalUser(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка сохранения доступов", "error");
    }
  };

  const handleFormSave = async (payload) => {
    if (!payload.fio) { showToast("Укажите ФИО сотрудника.", "error"); return; }
    if (!payload.department) { showToast("Укажите отделение сотрудника", "error"); return; }
    if (!payload.scheduleType) { showToast("Укажите график работы сотрудника", "error"); return; }
    if (!payload.kpiSum || Number(payload.kpiSum) <= 0) { showToast("Укажите KPI сумм (тенге)", "error"); return; }
    try {
      if (formMode === "add") { await apiAddEmployee(payload); showToast("Сотрудник успешно добавлен"); }
      else if (formMode === "edit") { await apiEditEmployee(payload); showToast("Данные сотрудника успешно обновлены"); }
      setFormMode(null);
      setFormInitial(null);
      await reloadKpiAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка сохранения сотрудника", "error");
    }
  };

  const handleDeleteClick = (emp) => setDeleteModalEmployee(emp);

  const handleDeleteConfirm = async (emp, reason) => {
    try {
      await apiDeleteEmployee(emp.id, reason);
      setDeleteModalEmployee(null);
      showToast("Сотрудник успешно удалён");
      await reloadKpiAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка удаления сотрудника", "error");
    }
  };

  const handleRestore = async (row) => {
    try {
      await apiRestoreEmployee({
        fio: row.fio, kpiSum: row.kpiSum, scheduleType: row.scheduleType,
        department: row.department, categoryCode: row.categoryCode,
        deleted_timestamp: row.timestamp || row.deleted_timestamp,
        deleted_by: row.user || row.deleted_by,
        deleted_reason: row.reason || row.deleted_reason,
      });
      showToast("Сотрудник успешно восстановлен");
      await reloadKpiAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || "Ошибка восстановления сотрудника", "error");
    }
  };

  return (
    <div className="kpi-wrapper">
      {/* Вкладки */}
      <div className="kpi-module-nav">
        <button className={`kpi-module-nav-tab${activeTab === "calc" ? " kpi-module-nav-tab-active" : ""}`} onClick={() => setActiveTab("calc")}>
          Расчёт KPI по табелю
        </button>
        <button className={`kpi-module-nav-tab${activeTab === "results" ? " kpi-module-nav-tab-active" : ""}`} onClick={() => setActiveTab("results")}>
          Результаты
        </button>
        <button className={`kpi-module-nav-tab${activeTab === "kpi" ? " kpi-module-nav-tab-active" : ""}`} onClick={() => setActiveTab("kpi")}>
          Справочник сотрудников
        </button>
        {isAdmin && (
          <button className={`kpi-module-nav-tab${activeTab === "access" ? " kpi-module-nav-tab-active" : ""}`} onClick={() => setActiveTab("access")}>
            Доступы к отделам
          </button>
        )}
        {isAdmin && (
          <button className={`kpi-module-nav-tab${activeTab === "settings" ? " kpi-module-nav-tab-active" : ""}`} onClick={() => setActiveTab("settings")}>
            Настройки
          </button>
        )}
      </div>

      <div className="app-main">
        {/* =================== Расчёт KPI =================== */}
        {activeTab === "calc" && (
          <section className="card">
            <h2>Расчёт KPI по табелю</h2>
            <p className="card-subtitle">Загрузите два табеля (прошлый и текущий месяц). Период расчёта: с 25 {prevMonthInfo.name} по 25 {currMonthName}.</p>

            <div className="form-grid">
              <div className="form-group file-field" style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {/* Prev month file */}
                <div style={{ flex: "1 1 280px" }}>
                  <label>Табель за {prevMonthInfo.name} {prevMonthInfo.year} (дни 25-конец):</label>
                  <div
                    className={`file-drop${isDragActivePrev ? " file-drop-active" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragActivePrev(true); }}
                    onDragLeave={() => setIsDragActivePrev(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragActivePrev(false); const file = e.dataTransfer?.files?.[0]; if (file) handleTimesheetFile(file, true); }}
                  >
                    <div className="file-drop-icon">↑</div>
                    <div className="file-drop-text">Табель прошлого месяца</div>
                    <div className="file-drop-actions">
                      <label className="btn btn-primary upload-btn" htmlFor="kpi-timesheet-prev-input">Выбрать файл</label>
                      <input id="kpi-timesheet-prev-input" className="file-input-hidden" type="file" accept=".xls,.xlsx" onChange={(e) => handleTimesheetFile(e.target.files[0] || null, true)} />
                    </div>
                    <div className="file-drop-hint">XLSX, XLS</div>
                    {timesheetFilePrev && <div className="file-drop-name">Выбран: {timesheetFilePrev.name}</div>}
                  </div>
                </div>
                {/* Current month file */}
                <div style={{ flex: "1 1 280px" }}>
                  <label>Табель за {currMonthName} {year} (дни 1-25):</label>
                  <div
                    className={`file-drop${isDragActive ? " file-drop-active" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                    onDragLeave={() => setIsDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragActive(false); const file = e.dataTransfer?.files?.[0]; if (file) handleTimesheetFile(file); }}
                  >
                    <div className="file-drop-icon">↑</div>
                    <div className="file-drop-text">Табель текущего месяца</div>
                    <div className="file-drop-actions">
                      <label className="btn btn-primary upload-btn" htmlFor="kpi-timesheet-input">Выбрать файл</label>
                      <input id="kpi-timesheet-input" className="file-input-hidden" type="file" accept=".xls,.xlsx" onChange={(e) => handleTimesheetFile(e.target.files[0] || null)} />
                    </div>
                    <div className="file-drop-hint">XLSX, XLS</div>
                    {timesheetFile && <div className="file-drop-name">Выбран: {timesheetFile.name}</div>}
                  </div>
                </div>
              </div>

              <div className="form-group workdays-auto-field">
                <label>Рабочие дни (период 25-25):</label>
                <div className="workdays-auto-card" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div className="workdays-auto-item">
                    <span className="workdays-auto-name">Дневные (Н.ч)</span>
                    <input type="number" min={0} max={31} style={{ width: "60px", textAlign: "center", fontWeight: "bold", fontSize: "16px" }}
                      value={nchDay} onChange={(e) => setNchDayOverride(parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div className="workdays-auto-divider" />
                  <div className="workdays-auto-item">
                    <span className="workdays-auto-name">Суточные (Н.д)</span>
                    <input type="number" min={0} max={31} style={{ width: "60px", textAlign: "center", fontWeight: "bold", fontSize: "16px" }}
                      value={ndShift} onChange={(e) => setNdShiftOverride(parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
                <div className="workdays-auto-note">Рассчитано автоматически для периода 25 {prevMonthInfo.name} — 25 {currMonthName}. Можно скорректировать вручную.</div>
              </div>

              <div className="form-group">
                <label>Год:</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>

              <div className="form-group month-field">
                <label>Месяц:</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)}>
                  {MONTH_SELECT_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={String(idx + 1)}>{idx + 1} - {name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Отдел для расчёта:</label>
                <select value={calcDepartment} onChange={(e) => setCalcDepartment(e.target.value)} disabled={allDepartments.length === 0}>
                  {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="form-group holiday-field">
                <label>Праздничные дни:</label>
                {holidays.length > 0 ? (
                  <div className="holiday-chips">
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>
                      Сохранённые праздничные дни ({holidays.length}):
                    </div>
                    {holidays.map((h) => {
                      const dateObj = new Date(h.date + "T00:00:00");
                      const day = dateObj.getDate();
                      const monthNames = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
                      return (
                        <span key={h.id || h.date} className="chip" title={h.description ? `${h.date} — ${h.description}` : h.date}>
                          {day} {monthNames[dateObj.getMonth()]}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", fontStyle: "italic" }}>
                    Праздничные дни не добавлены для этого месяца
                  </div>
                )}
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={handleCalc}>Рассчитать и показать</button>
              <button className="btn btn-outline" onClick={() => handleDownload("excel")}>Скачать общий Excel</button>
              <button className="btn btn-outline" onClick={() => handleDownload("1c")}>Скачать для 1С</button>
              <button className="btn btn-outline" onClick={() => handleDownload("buh")}>Скачать для бухгалтерии</button>
              <button className="btn btn-outline" onClick={() => handleDownload("pdf")}>Скачать PDF</button>
            </div>

            {calcResults.length > 0 && (
              <div className="results-block">
                <h3>Результаты расчёта</h3>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>#</th><th>ФИО</th><th>График</th><th>Отдел</th><th>Норма дней</th><th>Факт дней</th><th>% выполнения</th><th>KPI сумм</th><th>KPI итог</th></tr>
                    </thead>
                    <tbody>
                      {calcResults.map((r, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td><td>{r.fio}</td><td>{formatScheduleType(r.scheduleType)}</td>
                          <td>{r.department}</td><td>{r.daysAssigned}</td><td>{r.daysWorked}</td>
                          <td>{r.workPercent}</td><td>{r.kpiSum}</td><td>{r.kpiFinal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {calcIssues.length > 0 && (
              <div className="issues-block">
                <div className="issues-header">
                  <h3>Ошибки и предупреждения</h3>
                  <p>Проверьте корректность заполнения табеля и справочника KPI.</p>
                </div>
                <div className="issues-table">
                  <table>
                    <thead>
                      <tr><th>#</th><th>Сотрудник</th><th>Тип</th><th>Описание</th></tr>
                    </thead>
                    <tbody>
                      {calcIssues.map((issue, idx) => (
                        <tr key={idx}><td>{idx + 1}</td><td>{issue.fio || "—"}</td><td>{issue.type || "—"}</td><td>{issue.message}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =================== Результаты =================== */}
        {activeTab === "results" && (() => {
          // Build day columns: 25..lastDay of prevMonth, then 1..25 of currentMonth
          const pm = parseInt(month, 10);
          const py = parseInt(year, 10);
          let prevM = pm - 1, prevY = py;
          if (prevM < 1) { prevM = 12; prevY--; }
          const lastDayPrev = new Date(prevY, prevM, 0).getDate();
          const dayCols = [];
          for (let d = 25; d <= lastDayPrev; d++) dayCols.push({ day: d, month: prevM, year: prevY });
          for (let d = 1; d <= 25; d++) dayCols.push({ day: d, month: pm, year: py });

          // Day type colors
          const dayBg = (dv) => {
            if (!dv || !dv.value) return {};
            if (dv.dayType === 'holiday') return { background: "#fef2f2", color: "#dc2626" };
            if (dv.dayType === 'sun') return { background: "#fef2f2", color: "#dc2626" };
            if (dv.dayType === 'sat') return { background: "#fff7ed", color: "#ea580c" };
            if (dv.isNumber) return { background: "#f0fdf4", color: "#16a34a" };
            return { background: "#fefce8", color: "#ca8a04" };
          };

          // Match KPI result to parsed employee
          const getKpiResult = (fio) => calcResults.find(r => r.fio === fio);

          return (
          <section className="card">
            <h2>Результаты расчёта</h2>
            <p className="card-subtitle">
              Период: 25 {prevMonthInfo.name} — 25 {currMonthName} {year}. Каждый столбец — день. Цвета: зелёный — работал (число), жёлтый — буква (отсутствие), красный — вых/праздник.
            </p>

            {calcResults.length === 0 && parsedDetails.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                Нет данных. Сначала выполните расчёт на вкладке «Расчёт KPI по табелю».
              </div>
            ) : (
              <>
                {/* Таблица с днями */}
                {parsedDetails.length > 0 && (
                  <div className="results-block" style={{ marginBottom: "24px" }}>
                    <h3>Табель по дням (25-25)</h3>
                    <div className="table-wrapper" style={{ overflowX: "auto" }}>
                      <table style={{ fontSize: "11px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ position: "sticky", left: 0, background: "#f8fafc", zIndex: 2, minWidth: "30px" }}>#</th>
                            <th style={{ position: "sticky", left: "30px", background: "#f8fafc", zIndex: 2, minWidth: "180px", textAlign: "left" }}>ФИО</th>
                            {dayCols.map((dc, i) => {
                              const isNewMonth = i === 0 || dc.month !== dayCols[i - 1].month;
                              const shortMonth = MONTH_SELECT_NAMES[dc.month - 1]?.slice(0, 3) || "";
                              return (
                                <th key={i} style={{ minWidth: "28px", textAlign: "center", padding: "2px 1px", fontSize: "10px", borderLeft: isNewMonth ? "2px solid #94a3b8" : undefined }}>
                                  <div>{dc.day}</div>
                                  {isNewMonth && <div style={{ fontSize: "8px", color: "#94a3b8" }}>{shortMonth}</div>}
                                </th>
                              );
                            })}
                            <th style={{ minWidth: "40px", textAlign: "center", fontWeight: "bold" }} title="Буквы будни">Б</th>
                            <th style={{ minWidth: "40px", textAlign: "center", fontWeight: "bold" }} title="Числа (отработано)">Ч</th>
                            <th style={{ minWidth: "45px", textAlign: "center", fontWeight: "bold" }} title="Норма">Норма</th>
                            <th style={{ minWidth: "40px", textAlign: "center", fontWeight: "bold" }} title="Факт дней">Факт</th>
                            <th style={{ minWidth: "35px", textAlign: "center", fontWeight: "bold" }}>%</th>
                            <th style={{ minWidth: "55px", textAlign: "center", fontWeight: "bold" }}>KPI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedDetails.map((p, idx) => {
                            const dvMap = {};
                            (p.dayValues || []).forEach(dv => { dvMap[`${dv.year}-${dv.month}-${dv.day}`] = dv; });
                            const totalLetters = (p.letters_weekday || 0) + (p.letters_sat || 0) + (p.letters_sun || 0) + (p.letters_holiday || 0);
                            const totalNumbers = (p.numbers_weekday || 0) + (p.numbers_sat || 0) + (p.numbers_sun || 0) + (p.numbers_holiday || 0);
                            const kpi = getKpiResult(p.fio);
                            return (
                              <tr key={idx}>
                                <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, textAlign: "center" }}>{idx + 1}</td>
                                <td style={{ position: "sticky", left: "30px", background: "#fff", zIndex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }} title={p.fio}>{p.fio}</td>
                                {dayCols.map((dc, i) => {
                                  const dv = dvMap[`${dc.year}-${dc.month}-${dc.day}`];
                                  const isNewMonth = i === 0 || dc.month !== dayCols[i - 1].month;
                                  return (
                                    <td key={i} style={{ textAlign: "center", padding: "2px 1px", fontSize: "10px", borderLeft: isNewMonth ? "2px solid #94a3b8" : undefined, ...dayBg(dv) }}
                                        title={dv ? `${dc.day}.${String(dc.month).padStart(2,"0")} — ${dv.value || "пусто"} (${dv.dayType})` : ""}>
                                      {dv?.value || ""}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: "center", fontWeight: "bold", color: totalLetters > 0 ? "#ca8a04" : undefined }}>{totalLetters}</td>
                                <td style={{ textAlign: "center", fontWeight: "bold", color: totalNumbers > 0 ? "#16a34a" : undefined }}>{totalNumbers}</td>
                                <td style={{ textAlign: "center" }}>{kpi?.daysAssigned ?? "—"}</td>
                                <td style={{ textAlign: "center", fontWeight: "bold" }}>{kpi?.daysWorked ?? "—"}</td>
                                <td style={{ textAlign: "center" }}>{kpi ? `${kpi.workPercent}%` : "—"}</td>
                                <td style={{ textAlign: "center", fontWeight: "bold" }}>{kpi?.kpiFinal ?? "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Ошибки */}
                {calcErrors.length > 0 && (
                  <div className="issues-block" style={{ marginTop: "16px" }}>
                    <h3>Ошибки и предупреждения ({calcErrors.length})</h3>
                    <div className="issues-table">
                      <table>
                        <thead>
                          <tr><th>#</th><th>Сотрудник</th><th>Тип</th><th>Описание</th></tr>
                        </thead>
                        <tbody>
                          {calcErrors.map((e, idx) => (
                            <tr key={idx}><td>{idx + 1}</td><td>{e.fio || "—"}</td><td>{e.type || "—"}</td><td>{e.details || "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
          );
        })()}

        {/* =================== Справочник KPI =================== */}
        {activeTab === "kpi" && (
          <section className="card">
            <div className="card-header-row">
              <div>
                <h2>Справочник сотрудников KPI</h2>
                <p className="card-subtitle">Добавление, редактирование, удаление и восстановление сотрудников.</p>
              </div>
              <button className="btn btn-primary" onClick={openAddForm}>+ Добавить сотрудника</button>
            </div>

            <div className="kpi-tabs">
              <button className={`kpi-tab${kpiTab === "list" ? " kpi-tab-active" : ""}`} onClick={() => setKpiTab("list")}>Текущий список</button>
              <button className={`kpi-tab${kpiTab === "deleted" ? " kpi-tab-active" : ""}`} onClick={() => setKpiTab("deleted")}>Удалённые</button>
              <button className={`kpi-tab${kpiTab === "history" ? " kpi-tab-active" : ""}`} onClick={() => setKpiTab("history")}>История изменений</button>
            </div>

            {kpiTab === "list" && (
              <>
                <div className="kpi-filters">
                  <input className="kpi-search" placeholder="Поиск по ФИО..." value={searchFio} onChange={(e) => setSearchFio(e.target.value)} />
                  <select className="kpi-select" value={filterSchedule} onChange={(e) => setFilterSchedule(e.target.value)}>
                    <option value="all">Все графики</option>
                    <option value="day">Дневные</option>
                    <option value="shift">Суточные</option>
                  </select>
                  <select className="kpi-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                    <option value="">Все отделения</option>
                    {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button className="kpi-select" onClick={() => setSortBy((prev) => (prev === "fio" ? "id" : "fio"))}>
                    Сортировать по: {sortBy === "fio" ? "ФИО" : "ID"}
                  </button>
                  <div className="kpi-count">Всего: <strong>{filteredKpiItems.length}</strong></div>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>#</th><th>ID</th><th>ФИО</th><th>KPI сумм</th><th>График</th><th>Отдел</th><th>Категория</th><th>Действия</th></tr>
                    </thead>
                    <tbody>
                      {filteredKpiItems.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center" }}>Сотрудников не найдено.</td></tr>}
                      {filteredKpiItems.map((emp, idx) => (
                        <tr key={emp.id}>
                          <td>{idx + 1}</td><td>{emp.id}</td><td>{emp.fio}</td><td>{emp.kpiSum}</td>
                          <td>{formatScheduleType(emp.scheduleType)}</td><td>{emp.department}</td><td>{emp.categoryCode}</td>
                          <td>
                            <button className="btn btn-small" onClick={() => openEditForm(emp)}>Редактировать</button>
                            <button className="btn btn-small btn-danger" onClick={() => handleDeleteClick(emp)}>Удалить</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {kpiTab === "deleted" && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>ФИО</th><th>KPI сумм</th><th>График</th><th>Отдел</th><th>Категория</th><th>Когда удалён</th><th>Кем</th><th>Причина</th><th>Действия</th></tr>
                  </thead>
                  <tbody>
                    {(!deletedItems || deletedItems.length === 0) && <tr><td colSpan={9} style={{ textAlign: "center" }}>Удалённых сотрудников нет.</td></tr>}
                    {deletedItems && deletedItems.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.fio}</td><td>{row.kpiSum}</td><td>{formatScheduleType(row.scheduleType)}</td>
                        <td>{row.department}</td><td>{row.categoryCode}</td>
                        <td>{row.timestamp || row.deleted_timestamp}</td><td>{row.user || row.deleted_by}</td><td>{row.reason || row.deleted_reason}</td>
                        <td><button className="btn btn-small btn-primary" onClick={() => handleRestore(row)}>Вернуть</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {kpiTab === "history" && (
              <div className="history-grid">
                <div>
                  <h3>Редактирования</h3>
                  <div className="table-wrapper small">
                    <table>
                      <thead><tr><th>Когда</th><th>Кто</th><th>ФИО</th><th>Отдел</th><th>График</th><th>Категория</th><th>KPI сумм</th></tr></thead>
                      <tbody>
                        {(!editedItems || editedItems.length === 0) && <tr><td colSpan={7} style={{ textAlign: "center" }}>Нет записей.</td></tr>}
                        {editedItems && editedItems.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.timestamp}</td><td>{row.user}</td>
                            <td>{formatChange(row.fio_old, row.fio_new)}</td>
                            <td>{formatChange(row.department_old, row.department_new)}</td>
                            <td>{formatChange(formatScheduleType(row.scheduleType_old), formatScheduleType(row.scheduleType_new))}</td>
                            <td>{formatChange(row.categoryCode_old, row.categoryCode_new)}</td>
                            <td>{formatChange(row.kpiSum_old, row.kpiSum_new)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3>Восстановления</h3>
                  <div className="table-wrapper small">
                    <table>
                      <thead><tr><th>Когда</th><th>Кто</th><th>ФИО</th><th>Отдел</th><th>График</th><th>KPI сумм</th></tr></thead>
                      <tbody>
                        {(!restoredItems || restoredItems.length === 0) && <tr><td colSpan={6} style={{ textAlign: "center" }}>Нет записей.</td></tr>}
                        {restoredItems && restoredItems.map((row, idx) => (
                          <tr key={idx}><td>{row.timestamp}</td><td>{row.user}</td><td>{row.fio}</td><td>{row.department}</td><td>{formatScheduleType(row.scheduleType)}</td><td>{row.kpiSum}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =================== Доступы =================== */}
        {activeTab === "access" && isAdmin && (
          <section className="card">
            <div className="card-header-row">
              <div>
                <h2>Доступы к отделам</h2>
                <p className="card-subtitle">Настройте, какие отделы доступны каждому пользователю.</p>
              </div>
              <button className="btn btn-secondary" onClick={loadAccessUsers} disabled={accessLoading}>Обновить</button>
            </div>
            {accessLoading ? (
              <div className="empty-state">Загрузка списка...</div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Пользователь</th><th>Роль</th><th>Отделы</th><th>Действия</th></tr></thead>
                  <tbody>
                    {(!accessUsers || accessUsers.length === 0) && <tr><td colSpan={4} style={{ textAlign: "center" }}>Пользователей нет.</td></tr>}
                    {accessUsers && accessUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="user-cell">
                            <div className="user-name">{u.username || u.email || "ID " + u.id}</div>
                            <div className="user-email">{u.email}</div>
                          </div>
                        </td>
                        <td>{u.role || "—"}</td>
                        <td>
                          <div className="dept-chips">
                            {Array.isArray(u.allowedDepartments) && u.allowedDepartments.length > 0
                              ? u.allowedDepartments.map((d) => <span className="chip" key={String(u.id) + "-" + String(d)}>{d}</span>)
                              : <span className="muted">Нет</span>}
                          </div>
                        </td>
                        <td><button className="btn btn-small" onClick={() => openAccessModal(u)}>Настроить</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* =================== Настройки =================== */}
        {activeTab === "settings" && isAdmin && (
          <section className="card">
            <h2>Настройки рабочих дней</h2>
            <p className="card-subtitle">Автоматически рассчитанные рабочие дни для периода 25-25 на {year} год. Значения можно отредактировать.</p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Месяц</th><th>Период</th><th>Дневные (Н.ч)</th><th>Суточные (Н.д)</th></tr>
                </thead>
                <tbody>
                  {MONTH_SELECT_NAMES.map((name, idx) => {
                    const m = idx + 1;
                    const y = parseInt(year, 10);
                    const computed = calcWorkdaysForPeriod(y, m, holidays);
                    let pm = m - 1, py = y;
                    if (pm < 1) { pm = 12; py--; }
                    const prevName = MONTH_SELECT_NAMES[pm - 1] || "";
                    return (
                      <tr key={m}>
                        <td><strong>{m} - {name}</strong></td>
                        <td style={{ fontSize: "12px", color: "#64748b" }}>25 {prevName} — 25 {name}</td>
                        <td style={{ textAlign: "center" }}>{computed.day}</td>
                        <td style={{ textAlign: "center" }}>{computed.shift}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "12px", fontSize: "12px", color: "#64748b" }}>
              Праздники РК учтены автоматически. Для корректировки перейдите на вкладку «Расчёт KPI» и измените значения Н.ч/Н.д перед расчётом.
            </div>
          </section>
        )}
      </div>

      {/* Глобальные модалки */}
      <Toast message={toast} onClose={() => setToast(null)} />
      <DeleteConfirmModal employee={deleteModalEmployee} onCancel={() => setDeleteModalEmployee(null)} onConfirm={handleDeleteConfirm} />
      <EmployeeFormModal initial={formInitial} mode={formMode} onCancel={() => { setFormMode(null); setFormInitial(null); }} onSave={handleFormSave} />
      <AccessModal user={accessModalUser} departments={allDepartments} onCancel={() => setAccessModalUser(null)} onSave={handleAccessSave} />
    </div>
  );
}
