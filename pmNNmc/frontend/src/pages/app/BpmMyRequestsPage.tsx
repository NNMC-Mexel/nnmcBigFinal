import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
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
  Search,
  Send,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
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
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const categoryLabels = { ALL: 'Все', EMPLOYEE: 'Сотруднику', HR: 'Кадры', TIME: 'Рабочее время' } as const;
type CategoryFilter = keyof typeof categoryLabels;
const terminalStatuses = new Set<BpmRequestStatus>(['COMPLETED', 'REJECTED', 'CANCELLED']);
const advanceableStatuses = new Set<BpmRequestStatus>(['DRAFT', 'SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW', 'ACCOUNTING_REVIEW', 'ONEC_SENT']);
const historyFilters: Array<'ALL' | BpmRequestStatus> = ['ALL', 'SUBMITTED', 'MANAGER_REVIEW', 'HR_REVIEW', 'ACCOUNTING_REVIEW', 'ONEC_PENDING', 'ONEC_SENT', 'COMPLETED', 'REJECTED'];

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
  const [canAdvance, setCanAdvance] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [sendingOneCId, setSendingOneCId] = useState<number | null>(null);
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
      setCanAdvance(list.canAdvance);
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

  const canSendRequestToOneC = (request: BpmRequest) => canReview && (
    request.status === 'ACCOUNTING_REVIEW' || request.status === 'ONEC_PENDING' ||
    (canAdvance && (request.status === 'ONEC_SENT' || request.status === 'COMPLETED') && !request.onecDocumentNumber)
  );

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">{canReview ? 'Центр бизнес-процессов' : 'Мои заявки'}</h1>
          <p className="mt-1 text-sm text-slate-500">{canReview ? 'Кадровые документы, рабочее время и передача в 1С.' : 'Создание заявок и контроль маршрута согласования.'}</p>
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
            {filteredRequests.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Заявок пока нет</div> : filteredRequests.map((request) => (
              <div key={request.id} className="p-4">
                <div className="mb-2 flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-teal-700">{request.requestNumber}</p><p className="font-semibold text-slate-900">{request.title}</p></div><span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass[request.status]}`}>{statusLabels[request.status] || request.status}</span></div>
                <div className="space-y-1 text-sm text-slate-600">{canReview ? <p><span className="font-semibold text-slate-700">{request.employeeName || 'Без сотрудника'}</span>{request.employeeDepartment ? ` · ${request.employeeDepartment}` : ''}</p> : null}{request.startDate ? <p>{formatDate(request.startDate)}{request.endDate ? ` - ${formatDate(request.endDate)}` : ''}{request.days ? ` · ${request.days} дн.` : ''}</p> : <p>Тип интеграции 1С: {request.integrationType || '—'}</p>}<p>{request.workflowStage || 'Маршрут формируется'}</p><p className="text-xs text-slate-400">Создано: {formatDate(request.createdAt || request.submittedAt)}</p></div>
                {canReview && (request.onecError || request.onecDocumentNumber) ? <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{request.onecDocumentNumber ? <p>Документ 1С: {request.onecDocumentNumber}</p> : null}{request.onecError ? <p className="text-red-600">1С: {request.onecError}</p> : null}</div> : null}
                {canReview && request.history?.length ? <div className="mt-3 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-500">{request.history.slice(-3).map((item, index) => <p key={`${item.at}-${index}`}><span className="font-medium text-slate-600">{item.label || item.action}</span>{item.at ? ` · ${formatDate(item.at)}` : ''}</p>)}</div> : null}
                {canReview ? <div className="mt-3 flex flex-wrap gap-2">{canSendRequestToOneC(request) ? <button type="button" onClick={() => void sendRequestToOneC(request)} disabled={sendingOneCId === request.id} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">{sendingOneCId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Передать в 1С</button> : null}{canAdvance && !terminalStatuses.has(request.status) && advanceableStatuses.has(request.status) ? <button type="button" onClick={() => void advanceRequest(request)} disabled={advancingId === request.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{advancingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}Далее</button> : null}</div> : null}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
