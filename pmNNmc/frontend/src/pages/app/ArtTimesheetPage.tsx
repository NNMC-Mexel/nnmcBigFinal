import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  UsersRound,
  X,
} from 'lucide-react';
import {
  artTimesheetApi,
  type ArtDay,
  type ArtDayCode,
  type ArtDepartment,
  type ArtPeriod,
  type ArtPeriodDetail,
  type ArtPolicy,
  type ArtStatus,
} from '../../api/artTimesheet';
import { useAuthStore } from '../../store/authStore';

type ViewMode = 'PLAN' | 'ACTUAL' | 'MY';
type DayChange = {
  id: number;
  code: string;
  hours: number;
  reason?: string;
  nightHours?: number;
  overtimeHours?: number;
  holidayHours?: number;
};

const statusLabel: Record<ArtStatus, string> = {
  DRAFT: 'Черновик графика',
  MANAGER_REVIEW: 'У руководителя',
  HR_REVIEW: 'График в HR',
  ACTIVE: 'Фактический учёт',
  FINAL_HR_REVIEW: 'Табель в HR',
  APPROVED: 'Утверждён',
  ONEC_PENDING: 'Готов к передаче в 1С',
  ONEC_SENT: 'Передан в 1С',
  KPI_READY: 'Готов для KPI',
  CLOSED: 'Период закрыт',
  RETURNED: 'На исправлении',
};

const statusStyle: Record<ArtStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  MANAGER_REVIEW: 'bg-amber-100 text-amber-800',
  HR_REVIEW: 'bg-violet-100 text-violet-800',
  ACTIVE: 'bg-blue-100 text-blue-800',
  FINAL_HR_REVIEW: 'bg-violet-100 text-violet-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  ONEC_PENDING: 'bg-orange-100 text-orange-800',
  ONEC_SENT: 'bg-teal-100 text-teal-800',
  KPI_READY: 'bg-cyan-100 text-cyan-800',
  CLOSED: 'bg-slate-200 text-slate-700',
  RETURNED: 'bg-red-100 text-red-800',
};

const codeStyle: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  slate: 'bg-slate-100 text-slate-600 border-slate-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  pink: 'bg-pink-100 text-pink-800 border-pink-300',
  teal: 'bg-teal-100 text-teal-800 border-teal-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  yellow: 'bg-yellow-100 text-yellow-900 border-yellow-400',
};

const actionLabel: Record<string, string> = {
  submit_plan: 'Отправить руководителю',
  approve_manager: 'Согласовать и передать в HR',
  approve_plan_hr: 'Утвердить график',
  submit_actual: 'Отправить фактический табель в HR',
  approve_actual_hr: 'Утвердить фактический табель',
  close: 'Закрыть период',
  reopen: 'Открыть новую ревизию',
};

const monthName = (year: number, month: number) =>
  new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

const messageFromError = (error: any) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Не удалось выполнить операцию';

const dayNumber = (date: string) => Number(date.slice(8, 10));
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00`).getDay());
const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString('ru-RU') : '-';

function groupedDays(days: ArtDay[]) {
  const result = new Map<string, ArtDay[]>();
  for (const day of days) {
    const key = `${day.personnelNumber}:${day.employeeName}`;
    result.set(key, [...(result.get(key) || []), day]);
  }
  return Array.from(result.entries()).map(([key, entries]) => ({
    key,
    employee: entries[0],
    days: entries.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

function SummaryBox({ label, value, icon: Icon, tone = 'slate' }: {
  label: string;
  value: string | number;
  icon: typeof UsersRound;
  tone?: 'slate' | 'teal' | 'amber' | 'blue';
}) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className="flex min-w-0 items-center gap-3 border-r border-slate-200 px-4 py-3 last:border-r-0">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${styles[tone]}`}><Icon className="h-4.5 w-4.5" /></span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-slate-500">{label}</span>
        <strong className="block truncate text-base text-slate-900">{value}</strong>
      </span>
    </div>
  );
}

export default function ArtTimesheetPage() {
  const { user } = useAuthStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState<ViewMode>('MY');
  const [departments, setDepartments] = useState<ArtDepartment[]>([]);
  const [periods, setPeriods] = useState<ArtPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ArtPeriodDetail | null>(null);
  const [myCalendar, setMyCalendar] = useState<Awaited<ReturnType<typeof artTimesheetApi.myCalendar>> | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [createDepartment, setCreateDepartment] = useState('');
  const [selectedCode, setSelectedCode] = useState('WORK');
  const [patternEmployee, setPatternEmployee] = useState('');
  const [pattern, setPattern] = useState<'FIVE_DAY_PLUS_SATURDAY' | 'SIX_DAY' | 'SHIFT_24_48'>('FIVE_DAY_PLUS_SATURDAY');
  const [patternDate, setPatternDate] = useState('');
  const [patternHours, setPatternHours] = useState(8);
  const [changes, setChanges] = useState<Map<number, DayChange>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [decision, setDecision] = useState<{ action: string; title: string; requireComment?: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [policy, setPolicy] = useState<ArtPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState<ArtPolicy | null>(null);
  const isSuperAdmin = user?.isSuperAdmin === true;
  const creatableDepartments = useMemo(
    () => departments.filter((department) => department.canCreate === true),
    [departments]
  );

  const loadPeriods = async () => {
    const [departmentResult, periodResult, own, activePolicy] = await Promise.all([
      artTimesheetApi.departments(),
      artTimesheetApi.periods({ year, month }),
      artTimesheetApi.myCalendar(year, month),
      artTimesheetApi.policy(),
    ]);
    setDepartments(departmentResult.data);
    setCanCreate(departmentResult.canCreate || periodResult.canCreate);
    setPeriods(periodResult.data);
    setMyCalendar(own);
    setPolicy(activePolicy);
    const firstCreatable = departmentResult.data.find((department) => department.canCreate === true);
    const selectedStillAllowed = departmentResult.data.some(
      (department) => department.canCreate === true
        && (department.id || department.name) === createDepartment
    );
    if (!selectedStillAllowed) setCreateDepartment(firstCreatable ? firstCreatable.id || firstCreatable.name : '');
    if (periodResult.data.length > 0) {
      const selected = periodResult.data.some((item) => item.id === selectedPeriodId)
        ? selectedPeriodId
        : periodResult.data[0].id;
      setSelectedPeriodId(selected);
      if (mode === 'MY' && (departmentResult.canCreate || periodResult.data.some((item) => item.availableActions?.editPlan || item.availableActions?.editActual))) {
        setMode(periodResult.data[0].phase === 'PLAN' ? 'PLAN' : 'ACTUAL');
      }
    } else {
      setSelectedPeriodId(null);
      setDetail(null);
    }
  };

  const loadDetail = async (id: number) => {
    const result = await artTimesheetApi.get(id);
    setDetail(result);
    setChanges(new Map());
    if (result.period.phase === 'PLAN' && mode === 'ACTUAL') setMode('PLAN');
  };

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      await loadPeriods();
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [year, month]);
  useEffect(() => {
    if (!selectedPeriodId) return;
    void loadDetail(selectedPeriodId).catch((nextError) => setError(messageFromError(nextError)));
  }, [selectedPeriodId]);

  const period = detail?.period || periods.find((item) => item.id === selectedPeriodId) || null;
  const rows = useMemo(() => groupedDays(detail?.days || []), [detail?.days]);
  const ownRows = useMemo(() => groupedDays(myCalendar?.days || []), [myCalendar?.days]);
  const codes = detail?.policy.dayCodes || policy?.dayCodes || policyDraft?.dayCodes || [];
  const codeMap = useMemo(() => new Map(codes.map((item) => [item.code, item])), [codes]);
  const editingAllowed = mode === 'PLAN' ? period?.availableActions?.editPlan : period?.availableActions?.editActual;

  useEffect(() => {
    if (rows.length > 0 && !rows.some((row) => row.employee.personnelNumber === patternEmployee)) {
      setPatternEmployee(rows[0].employee.personnelNumber);
    }
  }, [rows, patternEmployee]);

  const selectedDepartment = departments.find((item) => (item.id || item.name) === createDepartment);

  const createPeriod = async () => {
    if (!selectedDepartment) return;
    setBusy(true);
    setError('');
    try {
      const created = await artTimesheetApi.create({
        year,
        month,
        departmentId: selectedDepartment.id,
        departmentName: selectedDepartment.name,
        organizationId: selectedDepartment.organizationId,
        organizationName: selectedDepartment.organizationName,
      });
      setSuccess(`График для подразделения «${created.departmentName}» создан`);
      await loadPeriods();
      setSelectedPeriodId(created.id);
      setMode('PLAN');
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const updateCell = (day: ArtDay) => {
    if (!editingAllowed || period?.locked) return;
    const code = codeMap.get(selectedCode);
    if (!code) return;
    setChanges((current) => {
      const next = new Map(current);
      next.set(day.id, {
        id: day.id,
        code: code.code,
        hours: code.defaultHours,
      });
      return next;
    });
  };

  const saveChanges = async () => {
    if (!period || changes.size === 0) return;
    setBusy(true);
    setError('');
    try {
      await artTimesheetApi.updateDays(period.id, {
        revision: period.revision,
        phase: mode === 'PLAN' ? 'PLAN' : 'ACTUAL',
        changes: Array.from(changes.values()),
      });
      await loadDetail(period.id);
      await loadPeriods();
      setSuccess(`Сохранено изменений: ${changes.size}`);
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const generateActual = async () => {
    if (!period) return;
    setBusy(true);
    setError('');
    try {
      await artTimesheetApi.generateActual(period.id);
      await loadDetail(period.id);
      await loadPeriods();
      setSuccess('Фактический табель пересчитан по графику и утверждённым BPM-заявкам');
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const applyPattern = async () => {
    if (!period || !patternEmployee) return;
    setBusy(true);
    setError('');
    try {
      await artTimesheetApi.applyPattern(period.id, {
        revision: period.revision,
        personnelNumber: patternEmployee,
        pattern,
        hours: patternHours,
        ...(pattern === 'SHIFT_24_48' ? { anchorDate: patternDate } : {}),
        ...(pattern === 'FIVE_DAY_PLUS_SATURDAY' ? { workingSaturday: patternDate } : {}),
      });
      await loadDetail(period.id);
      await loadPeriods();
      setSuccess('Шаблон графика применён');
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const executeDecision = async () => {
    if (!period || !decision) return;
    if (decision.requireComment && !comment.trim()) {
      setError('Укажите причину возврата');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (decision.action === 'send-to-1c') {
        await artTimesheetApi.sendToOneC(period.id);
      } else if (decision.action === 'send-to-kpi') {
        await artTimesheetApi.sendToKpi(period.id);
      } else {
        await artTimesheetApi.transition(period.id, decision.action, comment.trim());
      }
      setDecision(null);
      setComment('');
      await loadDetail(period.id);
      await loadPeriods();
      setSuccess('Этап выполнен');
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const openPolicy = async () => {
    setBusy(true);
    try {
      const policy = await artTimesheetApi.policy();
      const mapping = policy.onecMappings?.dayCodes || {};
      setPolicyDraft({
        ...policy,
        dayCodes: policy.dayCodes.map((code) => ({ ...code, onecCode: mapping[code.code] || code.onecCode || '' })),
      });
      setShowPolicy(true);
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    if (!policyDraft) return;
    setBusy(true);
    try {
      const dayCodeMappings = Object.fromEntries(policyDraft.dayCodes.map((code) => [code.code, code.onecCode || '']));
      await artTimesheetApi.updatePolicy({
        ...policyDraft,
        onecMappings: { ...(policyDraft.onecMappings || {}), documentType: 11, dayCodes: dayCodeMappings },
      });
      setShowPolicy(false);
      if (period) await loadDetail(period.id);
      setSuccess('Политика АРТ сохранена');
    } catch (nextError) {
      setError(messageFromError(nextError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>;
  }

  const visibleRows = mode === 'MY' ? ownRows : rows;
  const visibleDays = mode === 'MY' ? myCalendar?.days || [] : detail?.days || [];
  const dayDates = Array.from(new Set(visibleDays.map((item) => item.date))).sort();

  return (
    <div className="min-h-full bg-[#f4f8fb]">
      <div className="mx-auto max-w-[1900px] space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Автоматизация расчёта табеля</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">АРТ: графики и фактический табель</h1>
            <p className="mt-1 text-sm text-slate-500">Планирование, учёт отсутствий, согласование HR и передача в 1С</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button type="button" onClick={openPolicy} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Settings2 className="h-4 w-4" /> Политика
              </button>
            )}
            <button type="button" onClick={refresh} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title="Обновить">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error && <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
        {success && <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{success}</span><button onClick={() => setSuccess('')}><X className="h-4 w-4" /></button></div>}

        <section className="flex flex-wrap items-end gap-3 border-y border-slate-200 bg-white px-4 py-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Месяц</span>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={(event) => {
                const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
                setYear(nextYear); setMonth(nextMonth);
              }}
              className="block h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-500"
            />
          </label>
          {periods.length > 0 && (
            <label className="min-w-[280px] flex-1 space-y-1">
              <span className="text-xs font-medium text-slate-500">Подразделение и период</span>
              <span className="relative block">
                <select value={selectedPeriodId || ''} onChange={(event) => setSelectedPeriodId(Number(event.target.value))} className="h-10 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 pr-9 text-sm outline-none focus:border-teal-500">
                  {periods.map((item) => <option key={item.id} value={item.id}>{item.departmentName} · {statusLabel[item.status]}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
              </span>
            </label>
          )}
          {canCreate && (
            <>
              <label className="min-w-[260px] flex-1 space-y-1">
                <span className="text-xs font-medium text-slate-500">Новый график подразделения</span>
                <select value={createDepartment} onChange={(event) => setCreateDepartment(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500">
                  {creatableDepartments.map((item) => <option key={item.id || item.name} value={item.id || item.name}>{item.name} ({item.employeeCount})</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !selectedDepartment} onClick={createPeriod} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Создать график
              </button>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
          {([
            ['PLAN', 'График работы', CalendarDays],
            ['ACTUAL', 'Фактический табель', FileCheck2],
            ['MY', 'Мой календарь', Clock3],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`inline-flex h-10 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${mode === value ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {mode !== 'MY' && period && (
          <>
            <section className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
              <SummaryBox label="Статус" value={statusLabel[period.status]} icon={CheckCircle2} tone="teal" />
              <SummaryBox label="Сотрудников" value={period.employeeCount} icon={UsersRound} tone="blue" />
              <SummaryBox label={mode === 'PLAN' ? 'Плановые часы' : 'Фактические часы'} value={mode === 'PLAN' ? period.plannedHours : period.actualHours} icon={Clock3} />
              <SummaryBox label="Требует решения" value={period.unresolvedDays} icon={AlertTriangle} tone={period.unresolvedDays ? 'amber' : 'teal'} />
              <SummaryBox label="Ревизия" value={`${period.revision}${period.locked ? ' · закрыта' : ''}`} icon={period.locked ? LockKeyhole : RotateCcw} />
            </section>

            {period.status === 'RETURNED' && period.lastDecisionComment && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>Возвращено на исправление:</strong> {period.lastDecisionComment}
              </div>
            )}

            {period.onecError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <strong>Ошибка 1С:</strong> {period.onecError}
              </div>
            )}

            {period.kpiError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <strong>Ошибка KPI:</strong> {period.kpiError}
              </div>
            )}

            <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {codes.map((code) => (
                    <button
                      key={code.code}
                      type="button"
                      disabled={!editingAllowed}
                      onClick={() => setSelectedCode(code.code)}
                      title={code.label}
                      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${codeStyle[code.color] || codeStyle.slate} ${selectedCode === code.code ? 'ring-2 ring-teal-500 ring-offset-1' : ''} disabled:opacity-50`}
                    >
                      <span className="text-sm">{code.shortLabel}</span>{code.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {mode === 'ACTUAL' && period.availableActions?.editActual && (
                    <button type="button" onClick={generateActual} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                      <RefreshCw className="h-3.5 w-3.5" /> Пересчитать по BPM
                    </button>
                  )}
                  <button type="button" onClick={saveChanges} disabled={busy || changes.size === 0} className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Сохранить ({changes.size})
                  </button>
                </div>
              </div>

              {mode === 'PLAN' && period.availableActions?.editPlan && rows.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 border-y border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="min-w-[240px] flex-1 space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">Сотрудник для шаблона</span>
                    <input
                      list="art-pattern-employees"
                      value={patternEmployee}
                      onChange={(event) => setPatternEmployee(event.target.value)}
                      placeholder="Поиск по ФИО или табельному номеру"
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-teal-500"
                    />
                    <datalist id="art-pattern-employees">
                      {rows.map((row) => <option key={row.key} value={row.employee.personnelNumber}>{row.employee.employeeName}</option>)}
                    </datalist>
                  </label>
                  <label className="min-w-[220px] space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">Шаблон</span>
                    <select value={pattern} onChange={(event) => setPattern(event.target.value as typeof pattern)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-teal-500">
                      <option value="FIVE_DAY_PLUS_SATURDAY">5-дневка + одна суббота</option>
                      <option value="SIX_DAY">6-дневная неделя</option>
                      <option value="SHIFT_24_48">Сутки через двое</option>
                    </select>
                  </label>
                  {pattern !== 'SIX_DAY' && (
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{pattern === 'SHIFT_24_48' ? 'Первая смена' : 'Рабочая суббота'}</span>
                      <input type="date" value={patternDate} onChange={(event) => setPatternDate(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-teal-500" />
                    </label>
                  )}
                  {pattern !== 'SHIFT_24_48' && (
                    <label className="w-24 space-y-1">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Часов</span>
                      <input type="number" min={1} max={24} value={patternHours} onChange={(event) => setPatternHours(Number(event.target.value))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-teal-500" />
                    </label>
                  )}
                  <button type="button" onClick={applyPattern} disabled={busy || !patternEmployee || (pattern !== 'SIX_DAY' && !patternDate)} className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-300 bg-white px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-40">
                    <CalendarDays className="h-3.5 w-3.5" /> Применить шаблон
                  </button>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">В периоде нет строк</div>
              ) : (
                <TimesheetGrid
                  rows={rows}
                  dates={dayDates}
                  mode={mode}
                  codeMap={codeMap}
                  changes={changes}
                  editable={Boolean(editingAllowed && !period.locked)}
                  onCellClick={updateCell}
                />
              )}
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
              <div className="text-sm text-slate-500">
                Ответственный: <strong className="text-slate-700">{period.responsibleUser?.name || 'HR / не назначен'}</strong>
                <span className="mx-2">·</span>
                Руководитель: <strong className="text-slate-700">{period.managerUser?.name || 'не назначен'}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                {period.availableActions?.return && (
                  <button type="button" onClick={() => setDecision({ action: 'return', title: 'Вернуть табель на исправление', requireComment: true })} className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50">
                    <RotateCcw className="h-4 w-4" /> Вернуть
                  </button>
                )}
                {Object.entries(period.availableActions || {}).filter(([key, allowed]) => allowed && actionLabel[key]).map(([action]) => (
                  <button key={action} type="button" onClick={() => setDecision({ action, title: actionLabel[action] })} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
                    <ArrowRight className="h-4 w-4" /> {actionLabel[action]}
                  </button>
                ))}
                {period.availableActions?.sendToOneC && (
                  <button type="button" onClick={() => setDecision({ action: 'send-to-1c', title: 'Передать утверждённый табель в 1С' })} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700">
                    <Send className="h-4 w-4" /> Передать в 1С
                  </button>
                )}
                {period.availableActions?.sendToKpi && (
                  <button type="button" onClick={() => setDecision({ action: 'send-to-kpi', title: 'Передать зафиксированный табель в модуль KPI' })} className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800">
                    <FileCheck2 className="h-4 w-4" /> Передать в KPI
                  </button>
                )}
              </div>
            </section>

            {period.history.length > 0 && (
              <details className="rounded-md border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">История согласования ({period.history.length})</summary>
                <div className="border-t border-slate-200 px-4 py-3">
                  {period.history.slice().reverse().map((item, index) => (
                    <div key={`${item.at}-${index}`} className="grid gap-1 border-l-2 border-teal-200 py-2 pl-3 text-sm md:grid-cols-[180px_1fr_220px]">
                      <span className="text-slate-400">{formatDateTime(item.at)}</span>
                      <span className="text-slate-700">{item.label}{item.comment ? `: ${item.comment}` : ''}</span>
                      <span className="text-slate-500">{item.by}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {mode === 'MY' && (
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">{myCalendar?.employee?.fio || 'Мой календарь'}</h2>
                <p className="text-sm text-slate-500">{monthName(year, month)}</p>
              </div>
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Только ваши графики и изменения</span>
            </div>
            {!myCalendar?.employee ? (
              <div className="py-16 text-center text-sm text-slate-500">Карточка сотрудника не связана с текущим аккаунтом</div>
            ) : ownRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">На этот месяц график ещё не опубликован</div>
            ) : (
              <div className="p-3">
                <TimesheetGrid rows={ownRows} dates={dayDates} mode="MY" codeMap={codeMap} changes={new Map()} editable={false} onCellClick={() => {}} />
              </div>
            )}
          </section>
        )}
      </div>

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => !busy && setDecision(null)}>
          <div className="w-full max-w-md rounded-md bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-900">{decision.title}</h3>
              <button onClick={() => setDecision(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4 p-5">
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder={decision.requireComment ? 'Причина обязательна' : 'Комментарий к решению'} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
              <button type="button" onClick={executeDecision} disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {showPolicy && policyDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => !busy && setShowPolicy(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-md bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div><h3 className="font-semibold text-slate-900">Политика АРТ</h3><p className="text-xs text-slate-500">Коды 1С заполняются после подтверждения специалистом 1С</p></div>
              <button onClick={() => setShowPolicy(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Название</span><input value={policyDraft.name} onChange={(event) => setPolicyDraft({ ...policyDraft, name: event.target.value })} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" /></label>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <div className="grid grid-cols-[90px_1fr_120px_120px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"><span>Код</span><span>Наименование</span><span>Часы</span><span>Код 1С</span></div>
                {policyDraft.dayCodes.map((code, index) => (
                  <div key={code.code} className="grid grid-cols-[90px_1fr_120px_120px] items-center border-t border-slate-100 px-3 py-2 text-sm">
                    <strong>{code.shortLabel}</strong>
                    <span>{code.label}</span>
                    <input type="number" min={0} max={24} value={code.defaultHours} onChange={(event) => setPolicyDraft({ ...policyDraft, dayCodes: policyDraft.dayCodes.map((item, itemIndex) => itemIndex === index ? { ...item, defaultHours: Number(event.target.value) } : item) })} className="h-8 w-24 rounded border border-slate-300 px-2" />
                    <input value={code.onecCode || ''} onChange={(event) => setPolicyDraft({ ...policyDraft, dayCodes: policyDraft.dayCodes.map((item, itemIndex) => itemIndex === index ? { ...item, onecCode: event.target.value } : item) })} className="h-8 w-24 rounded border border-slate-300 px-2" />
                  </div>
                ))}
              </div>
              <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Праздничные даты, через запятую</span><textarea rows={3} value={(policyDraft.holidayDates || []).join(', ')} onChange={(event) => setPolicyDraft({ ...policyDraft, holidayDates: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="2026-01-01, 2026-03-08" /></label>
              <button type="button" onClick={savePolicy} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><Save className="h-4 w-4" /> Сохранить политику</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimesheetGrid({
  rows,
  dates,
  mode,
  codeMap,
  changes,
  editable,
  onCellClick,
}: {
  rows: ReturnType<typeof groupedDays>;
  dates: string[];
  mode: ViewMode;
  codeMap: Map<string, ArtDayCode>;
  changes: Map<number, DayChange>;
  editable: boolean;
  onCellClick: (day: ArtDay) => void;
}) {
  return (
    <div className="max-h-[62vh] overflow-auto border border-slate-200">
      <table className="min-w-max border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-slate-50">
          <tr>
            <th className="sticky left-0 z-30 w-[270px] min-w-[270px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Сотрудник</th>
            {dates.map((date) => (
              <th key={date} className={`h-12 w-11 min-w-11 border-b border-r border-slate-200 text-center font-semibold ${isWeekend(date) ? 'bg-slate-100 text-slate-500' : 'text-slate-700'}`}>
                <span className="block">{dayNumber(date)}</span>
                <span className="block text-[9px] font-normal uppercase">{new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
              </th>
            ))}
            <th className="sticky right-0 z-30 w-20 min-w-20 border-b border-l border-slate-200 bg-slate-50 px-2 text-center font-semibold text-slate-600">Часы</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = row.days.reduce((sum, day) => {
              if (mode === 'PLAN') return sum + Number(day.plannedHours || 0);
              if (mode === 'MY' && !day.actualCode) return sum + Number(day.plannedHours || 0);
              return sum + Number(day.actualHours || 0);
            }, 0);
            const dayByDate = new Map(row.days.map((day) => [day.date, day]));
            return (
              <tr key={row.key} className="group hover:bg-slate-50/70">
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 group-hover:bg-slate-50">
                  <strong className="block max-w-[250px] truncate text-sm text-slate-800">{row.employee.employeeName}</strong>
                  <span className="block max-w-[250px] truncate text-[11px] text-slate-500">{row.employee.personnelNumber} · {row.employee.positionName || 'должность не указана'}</span>
                  <span className="block max-w-[250px] truncate text-[10px] text-slate-400">{row.employee.scheduleName || 'график не указан'}</span>
                </td>
                {dates.map((date) => {
                  const day = dayByDate.get(date);
                  if (!day) return <td key={date} className="border-b border-r border-slate-200 bg-slate-50" />;
                  const change = changes.get(day.id);
                  const codeValue = change?.code || (mode === 'PLAN' ? day.plannedCode : day.actualCode || day.plannedCode);
                  const code = codeMap.get(codeValue);
                  const title = [
                    code?.label || codeValue,
                    day.sourceRequestNumber ? `BPM: ${day.sourceRequestNumber}` : '',
                    day.overrideReason || '',
                  ].filter(Boolean).join('\n');
                  return (
                    <td key={date} className="border-b border-r border-slate-200 p-0.5 text-center">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => onCellClick(day)}
                        title={title}
                        className={`flex h-9 w-10 items-center justify-center rounded border text-[11px] font-bold ${codeStyle[code?.color || 'slate']} ${change ? 'ring-2 ring-teal-500' : ''} ${day.eventType === 'CONFLICT' ? 'animate-pulse' : ''} disabled:cursor-default`}
                      >
                        {code?.shortLabel || codeValue?.slice(0, 2) || '-'}
                      </button>
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-b border-l border-slate-200 bg-white px-2 text-center font-semibold text-slate-700 group-hover:bg-slate-50">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
