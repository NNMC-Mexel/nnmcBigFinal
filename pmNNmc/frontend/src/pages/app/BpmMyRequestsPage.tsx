import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  HeartPulse,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  bpmRequestsApi,
  type BpmProcessField,
  type BpmRequest,
  type BpmRequestStatus,
  type BpmRequestTopType,
  type BpmRequestType,
} from '../../api/bpmRequests';
import { employeeCardsApi, type EmployeeCard, type EmployeeWorkplace } from '../../api/employeeCards';
import { useAuthStore } from '../../store/authStore';

const statusLabels: Record<BpmRequestStatus, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлено',
  MANAGER_REVIEW: 'У руководителя',
  HR_REVIEW: 'В кадрах',
  ACCOUNTING_REVIEW: 'В бухгалтерии',
  ONEC_PENDING: 'Ожидает 1С',
  ONEC_SENT: 'Передано в 1С',
  RETURNED: 'На исправлении',
  COMPLETED: 'Завершено',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отозвано',
};

const statusClass: Record<BpmRequestStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  MANAGER_REVIEW: 'bg-amber-100 text-amber-700',
  HR_REVIEW: 'bg-violet-100 text-violet-700',
  ACCOUNTING_REVIEW: 'bg-cyan-100 text-cyan-700',
  ONEC_PENDING: 'bg-orange-100 text-orange-700',
  ONEC_SENT: 'bg-teal-100 text-teal-700',
  RETURNED: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const categoryLabels = { ALL: 'Все', EMPLOYEE: 'Сотруднику', HR: 'Кадры', TIME: 'Рабочее время' } as const;
type CategoryFilter = keyof typeof categoryLabels;
const historyFilters: Array<'ALL' | BpmRequestStatus> = ['ALL', 'MANAGER_REVIEW', 'HR_REVIEW', 'ACCOUNTING_REVIEW', 'RETURNED', 'ONEC_PENDING', 'ONEC_SENT', 'COMPLETED', 'REJECTED'];

const roleLabels = {
  MANAGER: 'Руководитель',
  HR: 'Отдел кадров',
  ACCOUNTING: 'Бухгалтерия',
  ONEC: 'Передача в 1С',
} as const;

type DecisionKind = 'return' | 'reject' | 'cancel';
type PendingDecision = { request: BpmRequest; kind: DecisionKind } | null;

const typeIcons: Partial<Record<BpmRequestType, LucideIcon>> = {
  PHYSICAL_PERSON: UserRound,
  HIRING: UserPlus,
  PERSONNEL_TRANSFER: ArrowRightLeft,
  DISMISSAL: UserMinus,
  SICK_LEAVE: HeartPulse,
  VACATION: CalendarDays,
  DAY_OFF: CalendarDays,
  WEEKEND_WORK: CalendarDays,
  OVERTIME: Timer,
  POSITION_COMBINATION: Users,
  TIMESHEET: FileCheck2,
  CHILDCARE_LEAVE: HeartPulse,
  CHILDCARE_RETURN: ArrowRightLeft,
  VACATION_RECALL: ArrowRightLeft,
  UNPAID_LEAVE: CalendarDays,
  BUSINESS_TRIP: Briefcase,
  SCHEDULE_CHANGE: Clock3,
};

const optionLabel = (value: string) => {
  if (value === 'w') return 'Женский';
  if (value === 'm') return 'Мужской';
  if (value === '0') return 'Нет / не установлено';
  return value;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
};

const initialData = (template?: BpmRequestTopType | null) => Object.fromEntries(
  (template?.fields || []).map((field) => [field.key, field.type === 'boolean' ? false : field.type === 'repeater' ? [] : ''])
);

const primaryWorkplace = (card: EmployeeCard | null): EmployeeWorkplace | null =>
  card?.primaryWorkplace || card?.workplaces?.find((item) => item.primary) || card?.workplaces?.[0] || null;

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: BpmProcessField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const baseClass = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-teal-600" />
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === 'textarea') {
    return <textarea rows={3} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />;
  }
  if (field.type === 'select') {
    return (
      <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} className={baseClass}>
        <option value="">Выберите значение</option>
        {(field.options || []).map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
      </select>
    );
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'money' ? 'number' : 'text';
  return (
    <input
      type={inputType}
      value={String(value ?? '')}
      min={field.min}
      max={field.max}
      step={field.type === 'money' ? '0.01' : field.type === 'number' ? '1' : undefined}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      className={baseClass}
    />
  );
}

function RepeaterField({ field, value, onChange }: { field: BpmProcessField; value: unknown; onChange: (value: unknown) => void }) {
  const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
  const columns = field.columns || [];
  const addRow = () => onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, column.type === 'boolean' ? false : '']))]);
  return (
    <div className="md:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{field.label}{field.required ? ' *' : ''}</span>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
          <Plus className="h-3.5 w-3.5" /> Добавить строку
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Строки не добавлены</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))_36px]">
              {columns.map((column) => (
                <label key={column.key} className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">{column.label}{column.required ? ' *' : ''}</span>
                  <FieldControl
                    field={column}
                    value={row[column.key]}
                    onChange={(next) => onChange(rows.map((item, index) => index === rowIndex ? { ...item, [column.key]: next } : item))}
                  />
                </label>
              ))}
              <button type="button" title="Удалить строку" onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))} className="mt-5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BpmMyRequestsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [templates, setTemplates] = useState<BpmRequestTopType[]>([]);
  const [requests, setRequests] = useState<BpmRequest[]>([]);
  const [selfCard, setSelfCard] = useState<EmployeeCard | null>(null);
  const [targetCard, setTargetCard] = useState<EmployeeCard | null>(null);
  const [employeeResults, setEmployeeResults] = useState<EmployeeCard[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedPersonnelNumber, setSelectedPersonnelNumber] = useState('');
  const [selectedType, setSelectedType] = useState<BpmRequestType>('VACATION');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [comment, setComment] = useState('');
  const [canReview, setCanReview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [sendingOneCId, setSendingOneCId] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [correctionRequest, setCorrectionRequest] = useState<BpmRequest | null>(null);
  const [correctionData, setCorrectionData] = useState<Record<string, unknown>>({});
  const [correctionComment, setCorrectionComment] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeStatus, setActiveStatus] = useState<'ALL' | BpmRequestStatus>('ALL');

  const selectedTemplate = useMemo(() => templates.find((item) => item.code === selectedType) || null, [selectedType, templates]);
  const requiresTargetEmployee = canReview && selectedTemplate?.staffOnly === true && selectedTemplate.employeeMode === 'single';
  const activeCard = requiresTargetEmployee ? targetCard : targetCard || selfCard;
  const workplaces = activeCard?.workplaces || [];
  const activeWorkplace = useMemo(() => {
    return workplaces.find((item) => item.personnelNumber === selectedPersonnelNumber) || primaryWorkplace(activeCard);
  }, [activeCard, selectedPersonnelNumber, workplaces]);
  const visibleTemplates = useMemo(() => templates.filter((item) => category === 'ALL' || item.category === category), [category, templates]);
  const filteredRequests = useMemo(() => activeStatus === 'ALL' ? requests : requests.filter((request) => request.status === activeStatus), [activeStatus, requests]);
  const hasManagerInbox = useMemo(() => requests.some((request) => request.availableActions?.actorRole === 'MANAGER' && request.availableActions.advance), [requests]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [types, list, card] = await Promise.all([
        bpmRequestsApi.topTypes(),
        bpmRequestsApi.list(),
        employeeCardsApi.me().catch(() => null),
      ]);
      setTemplates(types);
      setRequests(list.data);
      setCanReview(list.canReview);
      setSelfCard(card);
      const current = types.find((item) => item.code === selectedType && item.enabled) || types.find((item) => item.enabled) || null;
      if (current) {
        setSelectedType(current.code);
        setFormData(initialData(current));
      }
      const workplace = primaryWorkplace(card);
      setSelectedPersonnelNumber(workplace?.personnelNumber || '');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить BPM заявки');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (!canReview || !selectedTemplate || selectedTemplate.employeeMode === 'none' || selectedTemplate.employeeMode === 'multiple') return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await employeeCardsApi.list({ page: 1, pageSize: 100, search: employeeSearch || undefined, active: 'true' });
        setEmployeeResults(result.items);
      } catch {
        setEmployeeResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [canReview, employeeSearch, selectedTemplate]);

  const chooseTemplate = (template: BpmRequestTopType) => {
    if (!template.enabled) return;
    setSelectedType(template.code);
    setFormData(initialData(template));
    setComment('');
    setError('');
    setSuccess('');
    setTargetCard(null);
    setEmployeeSearch('');
    setSelectedPersonnelNumber(
      template.staffOnly && template.employeeMode === 'single'
        ? ''
        : primaryWorkplace(selfCard)?.personnelNumber || ''
    );
  };

  const chooseEmployee = (card: EmployeeCard) => {
    setTargetCard(card);
    setEmployeeSearch(card.fio);
    setSelectedPersonnelNumber(primaryWorkplace(card)?.personnelNumber || '');
  };

  const submitProcess = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTemplate) return;
    setError('');
    setSuccess('');
    if (selectedTemplate.staffOnly && canReview && selectedTemplate.employeeMode === 'single' && !targetCard && !selectedPersonnelNumber) {
      setError('Выберите сотрудника из реестра или укажите табельный номер');
      return;
    }
    if ((selectedTemplate.employeeMode === 'self' || selectedTemplate.employeeMode === 'single') && !activeCard && !isSuperAdmin) {
      setError('Для процесса нужна карточка сотрудника из 1С');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await bpmRequestsApi.createProcess({
        type: selectedTemplate.code,
        data: formData,
        employeeCardId: activeCard?.id,
        employeeIin: activeCard?.iin,
        personnelNumber: activeWorkplace?.personnelNumber || selectedPersonnelNumber,
        employeeName: activeCard?.fio,
        employeePosition: activeWorkplace?.position,
        employeeDepartment: activeWorkplace?.department,
        employeeOrganization: activeWorkplace?.organization,
        comment,
      });
      setRequests((current) => [created, ...current]);
      setSuccess(`Заявка ${created.requestNumber} создана и отправлена на согласование`);
      setFormData(initialData(selectedTemplate));
      setComment('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось создать BPM заявку');
    } finally {
      setIsSubmitting(false);
    }
  };

  const replaceRequest = (updated: BpmRequest) => setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
  const advanceRequest = async (request: BpmRequest) => {
    setError(''); setSuccess(''); setAdvancingId(request.id);
    try {
      const updated = await bpmRequestsApi.advance(request.id);
      replaceRequest(updated);
      setSuccess(`Заявка ${updated.requestNumber}: ${updated.workflowStage || statusLabels[updated.status]}`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось перевести заявку дальше');
    } finally { setAdvancingId(null); }
  };
  const sendRequestToOneC = async (request: BpmRequest) => {
    setError(''); setSuccess(''); setSendingOneCId(request.id);
    try {
      const updated = await bpmRequestsApi.sendToOneC(request.id);
      replaceRequest(updated);
      setSuccess(`Заявка ${updated.requestNumber} проверена и передана в 1С`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось передать заявку в 1С');
    } finally { setSendingOneCId(null); }
  };

  const openDecision = (request: BpmRequest, kind: DecisionKind) => {
    setPendingDecision({ request, kind });
    setDecisionReason('');
  };

  const submitDecision = async () => {
    if (!pendingDecision || decisionReason.trim().length < 3) return;
    setDecisionLoading(true);
    setError('');
    setSuccess('');
    try {
      const { request, kind } = pendingDecision;
      const updated = kind === 'return'
        ? await bpmRequestsApi.returnForCorrection(request.id, decisionReason.trim())
        : kind === 'reject'
          ? await bpmRequestsApi.reject(request.id, decisionReason.trim())
          : await bpmRequestsApi.cancel(request.id, decisionReason.trim());
      replaceRequest(updated);
      setPendingDecision(null);
      setSuccess(`Заявка ${updated.requestNumber}: ${statusLabels[updated.status]}`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось выполнить действие');
    } finally {
      setDecisionLoading(false);
    }
  };

  const openCorrection = (request: BpmRequest) => {
    const template = templates.find((item) => item.code === request.type);
    setCorrectionRequest(request);
    setCorrectionData({ ...initialData(template), ...(request.processData || {}) });
    setCorrectionComment('');
  };

  const submitCorrection = async () => {
    if (!correctionRequest) return;
    setCorrectionLoading(true);
    setError('');
    setSuccess('');
    try {
      const updated = await bpmRequestsApi.resubmit(correctionRequest.id, correctionData, correctionComment.trim());
      replaceRequest(updated);
      setCorrectionRequest(null);
      setSuccess(`Заявка ${updated.requestNumber} исправлена и повторно отправлена`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось повторно отправить заявку');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const correctionTemplate = correctionRequest
    ? templates.find((item) => item.code === correctionRequest.type) || null
    : null;

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">{canReview ? 'Центр бизнес-процессов' : hasManagerInbox ? 'Мои и назначенные заявки' : 'Мои заявки'}</h1>
          <p className="mt-1 text-sm text-slate-500">{canReview ? 'Кадровые документы, рабочее время и передача в 1С.' : hasManagerInbox ? 'Ваши заявки и документы, где вы назначены согласующим.' : 'Создание заявок и контроль маршрута согласования.'}</p>
        </div>
        <button type="button" onClick={() => void loadData()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Обновить
        </button>
      </section>

      {error ? <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
      {success ? <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span></div> : null}

      <section className="border-y border-slate-200 bg-white py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(categoryLabels) as CategoryFilter[]).map((key) => (
            <button key={key} type="button" onClick={() => setCategory(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${category === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{categoryLabels[key]}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleTemplates.map((template) => {
            const Icon = typeIcons[template.code] || FileText;
            const active = selectedTemplate?.code === template.code;
            return (
              <button key={template.code} type="button" disabled={!template.enabled} onClick={() => chooseTemplate(template)} className={`min-h-[92px] rounded-lg border p-3 text-left transition ${active ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500' : template.enabled ? 'border-slate-200 bg-white hover:border-teal-300' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                <div className="flex items-start justify-between gap-2"><Icon className={`h-5 w-5 ${active ? 'text-teal-700' : 'text-slate-500'}`} /><span className="text-[11px] font-semibold text-slate-400">1С · {template.integrationType}</span></div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{template.title}</p>
                {!template.enabled ? <p className="mt-1 text-xs text-slate-400">Только кадровый контур</p> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <form onSubmit={submitProcess} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {selectedTemplate ? (
            <>
              <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-xs font-semibold uppercase text-teal-600">Новая заявка</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedTemplate.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedTemplate.description}</p></div>
                <span className="shrink-0 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">{selectedTemplate.documentObject}</span>
              </div>

              {(selectedTemplate.employeeMode === 'self' || selectedTemplate.employeeMode === 'single') ? (
                <div className="mb-5 space-y-3 bg-slate-50 p-4">
                  {canReview ? (
                    <div className="relative">
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Сотрудник</label>
                      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setTargetCard(null); }} placeholder="ФИО, ИИН или табельный номер" className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500" /></div>
                      {employeeSearch && !targetCard && employeeResults.length > 0 ? (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {employeeResults.slice(0, 20).map((card) => <button key={card.id} type="button" onClick={() => chooseEmployee(card)} className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-teal-50"><span className="block text-sm font-semibold text-slate-800">{card.fio}</span><span className="text-xs text-slate-500">{card.workplaces.map((item) => item.personnelNumber).filter(Boolean).join(', ')}</span></button>)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex items-start gap-3"><UserRound className="mt-1 h-5 w-5 text-slate-400" /><div><p className="text-xs text-slate-500">Сотрудник</p><p className="font-semibold text-slate-900">{activeCard?.fio || (isSuperAdmin ? 'Супер-администратор' : 'Карточка не найдена')}</p><p className="text-sm text-slate-500">{activeWorkplace?.position || 'Должность не указана'}</p></div></div>
                    <div><p className="text-xs text-slate-500">Место работы</p><p className="font-semibold text-slate-900">{activeWorkplace?.department || 'Подразделение не указано'}</p><p className="text-sm text-slate-500">{activeWorkplace?.organization || 'Организация не указана'}</p></div>
                  </div>
                  {workplaces.length > 1 ? (
                    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Табельный номер и место работы</span><select value={selectedPersonnelNumber} onChange={(event) => setSelectedPersonnelNumber(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{workplaces.map((item) => <option key={`${item.personnelNumber}-${item.departmentId}`} value={item.personnelNumber}>{item.personnelNumber} · {item.position} · {item.department}</option>)}</select></label>
                  ) : activeWorkplace?.personnelNumber ? <p className="text-xs text-slate-500">Табельный номер: <span className="font-semibold text-slate-700">{activeWorkplace.personnelNumber}</span></p> : null}
                  {canReview && !activeCard ? <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Табельный номер для 1С</span><input value={selectedPersonnelNumber} onChange={(event) => setSelectedPersonnelNumber(event.target.value)} placeholder="Укажите вручную, если карточка еще не создана" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label> : null}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {selectedTemplate.fields.map((field) => {
                  if (field.key === 'AdditionalVacation' && formData.additional !== true) return null;
                  if (field.type === 'repeater') return <RepeaterField key={field.key} field={field} value={formData[field.key]} onChange={(value) => setFormData((current) => ({ ...current, [field.key]: value }))} />;
                  return <label key={field.key} className={`space-y-1.5 ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}><span className="text-sm font-medium text-slate-700">{field.label}{field.required ? ' *' : ''}</span><FieldControl field={field} value={formData[field.key]} onChange={(value) => setFormData((current) => ({ ...current, [field.key]: value }))} /></label>;
                })}
                <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium text-slate-700">Комментарий к заявке</span><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
              </div>
              <div className="mt-5 flex justify-end"><button type="submit" disabled={isSubmitting || !selectedTemplate.enabled} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Отправить заявку</button></div>
            </>
          ) : <p className="py-10 text-center text-sm text-slate-500">Выберите бизнес-процесс</p>}
        </form>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4"><h2 className="text-lg font-bold text-slate-900">История заявок</h2><p className="text-sm text-slate-500">{canReview ? 'Все BPM заявки и текущий маршрут' : 'Ваши заявки и текущий маршрут'}</p><div className="mt-3 flex flex-wrap gap-2">{historyFilters.map((status) => <button key={status} type="button" onClick={() => setActiveStatus(status)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeStatus === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{status === 'ALL' ? 'Все' : statusLabels[status]}</button>)}</div></div>
          <div className="max-h-[760px] divide-y divide-slate-100 overflow-auto">
            {filteredRequests.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Заявок пока нет</div> : filteredRequests.map((request) => {
              const actions = request.availableActions;
              return (
                <div key={request.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div><p className="font-mono text-sm font-bold text-teal-700">{request.requestNumber}</p><p className="font-semibold text-slate-900">{request.title}</p></div>
                    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass[request.status]}`}>{statusLabels[request.status] || request.status}</span>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    {request.employeeName ? <p><span className="font-semibold text-slate-700">{request.employeeName}</span>{request.employeeDepartment ? ` · ${request.employeeDepartment}` : ''}</p> : null}
                    {request.startDate ? <p>{formatDate(request.startDate)}{request.endDate ? ` - ${formatDate(request.endDate)}` : ''}{request.days ? ` · ${request.days} дн.` : ''}</p> : <p>Тип интеграции 1С: {request.integrationType || '—'}</p>}
                    <p>{request.workflowStage || 'Маршрут формируется'}</p>
                    <p className="text-xs text-slate-400">Ревизия {request.revision || 1} · создано {formatDate(request.createdAt || request.submittedAt)}</p>
                  </div>

                  {canReview && request.currentActorRole === 'MANAGER' && !request.managerUserId ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      У подразделения не назначен BPM-руководитель. До назначения этап может обработать супер-администратор.
                    </div>
                  ) : null}

                  {request.workflowSnapshot?.length ? (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3">
                      {request.workflowSnapshot.map((step, index) => {
                        const current = index === request.currentStepIndex && !['ONEC_SENT', 'COMPLETED', 'REJECTED', 'CANCELLED'].includes(request.status);
                        const passed = index < (request.currentStepIndex ?? 0) || request.status === 'ONEC_SENT' || request.status === 'COMPLETED';
                        return (
                          <div key={step.key} className="flex items-center gap-2 text-xs">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${current ? 'bg-amber-500 ring-2 ring-amber-200' : passed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className={current ? 'font-semibold text-slate-800' : 'text-slate-500'}>{step.title}</span>
                            <span className="ml-auto text-[10px] text-slate-400">{roleLabels[step.role]}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {(request.onecError || request.onecDocumentNumber) ? <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{request.onecDocumentNumber ? <p>Документ 1С: {request.onecDocumentNumber}</p> : null}{request.onecError ? <p className="text-red-600">1С: {request.onecError}</p> : null}{request.integrationAttemptCount ? <p className="mt-1 text-slate-400">Попыток передачи: {request.integrationAttemptCount}</p> : null}</div> : null}
                  {request.lastDecisionComment ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><span className="font-semibold">Комментарий: </span>{request.lastDecisionComment}</div> : null}
                  {request.history?.length ? <div className="mt-3 space-y-2 border-l border-slate-200 pl-3 text-xs text-slate-500">{request.history.slice(-5).map((item, index) => <div key={`${item.at}-${index}`}><p><span className="font-medium text-slate-600">{item.label || item.action}</span>{item.by ? ` · ${item.by}` : ''}{item.at ? ` · ${formatDate(item.at)}` : ''}</p>{item.comment ? <p className="mt-0.5 text-slate-600">{item.comment}</p> : null}</div>)}</div> : null}

                  {actions && Object.entries(actions).some(([key, value]) => key !== 'actorRole' && value === true) ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      {actions.sendToOneC ? <button type="button" onClick={() => void sendRequestToOneC(request)} disabled={sendingOneCId === request.id} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">{sendingOneCId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Передать в 1С</button> : null}
                      {actions.advance ? <button type="button" onClick={() => void advanceRequest(request)} disabled={advancingId === request.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{advancingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}Согласовать и далее</button> : null}
                      {actions.returnForCorrection ? <button type="button" onClick={() => openDecision(request, 'return')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"><RotateCcw className="h-3.5 w-3.5" />На исправление</button> : null}
                      {actions.reject ? <button type="button" onClick={() => openDecision(request, 'reject')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><XCircle className="h-3.5 w-3.5" />Отклонить</button> : null}
                      {actions.cancel ? <button type="button" onClick={() => openDecision(request, 'cancel')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Ban className="h-3.5 w-3.5" />Отозвать</button> : null}
                      {actions.resubmit ? <button type="button" onClick={() => openCorrection(request)} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"><RotateCcw className="h-3.5 w-3.5" />Исправить и отправить</button> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      {pendingDecision ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-4">
              <div>
                <h2 className="font-bold text-slate-900">
                  {pendingDecision.kind === 'return' ? 'Возврат на исправление' : pendingDecision.kind === 'reject' ? 'Отклонение заявки' : 'Отзыв заявки'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{pendingDecision.request.requestNumber}</p>
              </div>
              <button type="button" title="Закрыть" onClick={() => setPendingDecision(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4">
              <label className="space-y-1.5"><span className="text-sm font-medium text-slate-700">Причина *</span><textarea autoFocus rows={5} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Опишите решение, чтобы оно сохранилось в истории" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <button type="button" onClick={() => setPendingDecision(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Отмена</button>
              <button type="button" onClick={() => void submitDecision()} disabled={decisionReason.trim().length < 3 || decisionLoading} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${pendingDecision.kind === 'reject' ? 'bg-red-600 hover:bg-red-700' : pendingDecision.kind === 'return' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-700 hover:bg-slate-800'}`}>{decisionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Подтвердить</button>
            </div>
          </div>
        </div>
      ) : null}

      {correctionRequest && correctionTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white p-4">
              <div><h2 className="font-bold text-slate-900">Исправление заявки</h2><p className="mt-1 text-sm text-slate-500">{correctionRequest.requestNumber} · {correctionTemplate.title}</p></div>
              <button type="button" title="Закрыть" onClick={() => setCorrectionRequest(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              {correctionRequest.lastDecisionComment ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span className="font-semibold">Причина возврата: </span>{correctionRequest.lastDecisionComment}</div> : null}
              <div className="grid gap-4 md:grid-cols-2">
                {correctionTemplate.fields.map((field) => {
                  if (field.key === 'AdditionalVacation' && correctionData.additional !== true) return null;
                  if (field.type === 'repeater') return <RepeaterField key={field.key} field={field} value={correctionData[field.key]} onChange={(value) => setCorrectionData((current) => ({ ...current, [field.key]: value }))} />;
                  return <label key={field.key} className={`space-y-1.5 ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}><span className="text-sm font-medium text-slate-700">{field.label}{field.required ? ' *' : ''}</span><FieldControl field={field} value={correctionData[field.key]} onChange={(value) => setCorrectionData((current) => ({ ...current, [field.key]: value }))} /></label>;
                })}
                <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium text-slate-700">Комментарий к исправлению</span><textarea rows={3} value={correctionComment} onChange={(event) => setCorrectionComment(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white p-4">
              <button type="button" onClick={() => setCorrectionRequest(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Отмена</button>
              <button type="button" onClick={() => void submitCorrection()} disabled={correctionLoading} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{correctionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Отправить повторно</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
