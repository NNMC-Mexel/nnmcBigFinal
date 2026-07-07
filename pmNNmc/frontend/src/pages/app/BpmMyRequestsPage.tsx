import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Loader2,
  Send,
  UserRound,
} from 'lucide-react';
import { bpmRequestsApi, type BpmRequest, type BpmRequestStatus, type BpmRequestTopType } from '../../api/bpmRequests';
import { employeeCardsApi, type EmployeeCard } from '../../api/employeeCards';
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

const terminalStatuses = new Set<BpmRequestStatus>(['COMPLETED', 'REJECTED', 'CANCELLED']);
const historyFilters: Array<'ALL' | BpmRequestStatus> = [
  'ALL',
  'SUBMITTED',
  'MANAGER_REVIEW',
  'HR_REVIEW',
  'ACCOUNTING_REVIEW',
  'ONEC_PENDING',
  'ONEC_SENT',
  'COMPLETED',
  'REJECTED',
];

const typeIcons: Record<string, typeof CalendarDays> = {
  VACATION: CalendarDays,
  SICK_LEAVE: FileCheck2,
  CERTIFICATE: FileText,
  MEMO: FileText,
  BUSINESS_TRIP: Briefcase,
  TRAINING: CheckCircle2,
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU');
};

const diffCalendarDays = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

export default function BpmMyRequestsPage() {
  const { user } = useAuthStore();
  const [topTypes, setTopTypes] = useState<BpmRequestTopType[]>([]);
  const [requests, setRequests] = useState<BpmRequest[]>([]);
  const [employeeCard, setEmployeeCard] = useState<EmployeeCard | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [sendingOneCId, setSendingOneCId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeStatus, setActiveStatus] = useState<'ALL' | BpmRequestStatus>('ALL');
  const [form, setForm] = useState({
    vacationType: 'Отпуск ежегодный',
    startDate: '',
    endDate: '',
    replacementEmployeeName: '',
    managerName: '',
    managerPosition: '',
    comment: '',
  });

  const primaryWorkplace = useMemo(() => {
    return employeeCard?.primaryWorkplace || employeeCard?.workplaces?.find((item) => item.primary) || employeeCard?.workplaces?.[0] || null;
  }, [employeeCard]);

  const requestedDays = useMemo(() => diffCalendarDays(form.startDate, form.endDate), [form.startDate, form.endDate]);

  const filteredRequests = useMemo(() => {
    if (activeStatus === 'ALL') return requests;
    return requests.filter((request) => request.status === activeStatus);
  }, [activeStatus, requests]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [types, list, card] = await Promise.all([
        bpmRequestsApi.topTypes(),
        bpmRequestsApi.list(),
        employeeCardsApi.me().catch(() => null),
      ]);
      setTopTypes(types);
      setRequests(list.data);
      setCanReview(list.canReview);
      setCanAdvance(list.canAdvance);
      setEmployeeCard(card);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить BPM заявки');
    } finally {
      setIsLoading(false);
    }
  };

  const replaceRequest = (updated: BpmRequest) => {
    setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));
  };

  const advanceRequest = async (request: BpmRequest) => {
    setError('');
    setSuccess('');
    setAdvancingId(request.id);
    try {
      const updated = await bpmRequestsApi.advance(request.id);
      replaceRequest(updated);
      setSuccess(`Заявка ${updated.requestNumber} переведена на этап: ${updated.workflowStage || statusLabels[updated.status]}`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось перевести заявку дальше');
    } finally {
      setAdvancingId(null);
    }
  };

  const sendRequestToOneC = async (request: BpmRequest) => {
    setError('');
    setSuccess('');
    setSendingOneCId(request.id);
    try {
      const updated = await bpmRequestsApi.sendToOneC(request.id);
      replaceRequest(updated);
      setSuccess(`Заявка ${updated.requestNumber} передана в 1С`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось передать заявку в 1С');
    } finally {
      setSendingOneCId(null);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const submitVacation = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.startDate || !form.endDate) {
      setError('Укажите даты начала и окончания отпуска');
      return;
    }
    if (!employeeCard) {
      setError('Карточка сотрудника не найдена. Нужно сначала синхронизировать сотрудников с 1С или войти под логином сотрудника с ИИН.');
      return;
    }
    if (!primaryWorkplace) {
      setError('В карточке сотрудника нет активного места работы из 1С. Обновите синхронизацию сотрудников.');
      return;
    }
    if (requestedDays <= 0) {
      setError('Дата окончания должна быть позже даты начала');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await bpmRequestsApi.createVacation({
        vacationType: form.vacationType,
        startDate: form.startDate,
        endDate: form.endDate,
        replacementEmployeeName: form.replacementEmployeeName,
        managerName: form.managerName,
        managerPosition: form.managerPosition,
        comment: form.comment,
      });
      setRequests((current) => [created, ...current]);
      setSuccess(`Заявка ${created.requestNumber} создана и отправлена на согласование`);
      setForm((current) => ({
        ...current,
        startDate: '',
        endDate: '',
        replacementEmployeeName: '',
        comment: '',
      }));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось создать заявку на отпуск');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">{canReview ? 'BPM заявки' : 'Мои заявки'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canReview
              ? 'Общий поток кадровых и корпоративных заявок по этапам.'
              : 'Подача кадровых и корпоративных заявок без внутреннего дерева процессов.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Clock3 className="h-4 w-4" />
          Обновить
        </button>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {topTypes.map((item) => {
          const Icon = typeIcons[item.type] || FileText;
          return (
            <button
              key={item.type}
              type="button"
              disabled={!item.enabled}
              className={`rounded-lg border bg-white p-4 text-left shadow-sm transition ${
                item.enabled
                  ? 'border-teal-200 hover:border-teal-300 hover:bg-teal-50/40'
                  : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p>
              {!item.enabled ? <p className="mt-3 text-xs font-semibold text-slate-400">Скоро</p> : null}
            </button>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={submitVacation} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-teal-600">Новая заявка</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Отпуск</h2>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
              1С: Отпуска сотрудников
            </span>
          </div>

          <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div className="flex items-start gap-3">
              <UserRound className="mt-1 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Сотрудник</p>
                <p className="font-semibold text-slate-900">{employeeCard?.fio || `${user?.lastName || ''} ${user?.firstName || ''}`.trim() || 'Сотрудник'}</p>
                <p className="text-sm text-slate-500">{primaryWorkplace?.position || user?.position || 'Должность не указана'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Подразделение</p>
              <p className="font-semibold text-slate-900">{primaryWorkplace?.department || user?.department?.name_ru || 'Не назначено'}</p>
              <p className="text-sm text-slate-500">{primaryWorkplace?.organization || 'Организация не указана'}</p>
            </div>
          </div>
          {!employeeCard || !primaryWorkplace ? (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Для заявки на отпуск нужна карточка сотрудника из 1С с активным местом работы. Если вы вошли под тестовым аккаунтом или карточка не синхронизирована, заявка не будет создана.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Вид отпуска</span>
              <select
                value={form.vacationType}
                onChange={(event) => setForm({ ...form, vacationType: event.target.value })}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option>Отпуск ежегодный</option>
                <option>Отпуск без сохранения заработной платы</option>
                <option>Отпуск без оплаты</option>
                <option>Дополнительный учебный отпуск (оплачиваемый)</option>
                <option>Дополнительный учебный отпуск без оплаты</option>
                <option>Отпуск для прохождения скрининговых исследований</option>
                <option>отпуск по беременности и родам</option>
                <option>Отпуск по уходу за ребенком</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Отпуск с</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">По</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
              <p className="text-xs font-semibold text-teal-700">Продолжительность</p>
              <p className="text-lg font-bold text-teal-900">{requestedDays || 0} календарных дней</p>
            </div>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Замещающий сотрудник</span>
              <input
                value={form.replacementEmployeeName}
                onChange={(event) => setForm({ ...form, replacementEmployeeName: event.target.value })}
                placeholder="ФИО, если требуется"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Руководитель отдела</span>
              <input
                value={form.managerName}
                onChange={(event) => setForm({ ...form, managerName: event.target.value })}
                placeholder="Подтянется из 1С после настройки"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Должность руководителя</span>
              <input
                value={form.managerPosition}
                onChange={(event) => setForm({ ...form, managerPosition: event.target.value })}
                placeholder="Например: заведующий отделением"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Комментарий</span>
              <textarea
                value={form.comment}
                onChange={(event) => setForm({ ...form, comment: event.target.value })}
                rows={3}
                placeholder="Дополнительная информация для руководителя или отдела кадров"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !employeeCard || !primaryWorkplace}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Отправить заявку
            </button>
          </div>
        </form>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-bold text-slate-900">История заявок</h2>
            <p className="text-sm text-slate-500">
              {canReview ? 'Все BPM заявки и текущий маршрут' : 'Ваши BPM заявки и текущий маршрут'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {historyFilters.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setActiveStatus(status)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    activeStatus === status ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {status === 'ALL' ? 'Все' : statusLabels[status]}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[620px] divide-y divide-slate-100 overflow-auto">
            {filteredRequests.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Заявок пока нет</div>
            ) : (
              filteredRequests.map((request) => (
                <div key={request.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-bold text-teal-700">{request.requestNumber}</p>
                      <p className="font-semibold text-slate-900">{request.title}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[request.status]}`}>
                      {statusLabels[request.status] || request.status}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    {canReview ? (
                      <p>
                        <span className="font-semibold text-slate-700">{request.employeeName || 'Сотрудник'}</span>
                        {request.employeeDepartment ? ` · ${request.employeeDepartment}` : ''}
                      </p>
                    ) : null}
                    <p>{formatDate(request.startDate)} - {formatDate(request.endDate)} · {request.days || 0} дн.</p>
                    <p>{request.workflowStage || 'Маршрут формируется'}</p>
                    <p className="text-xs text-slate-400">Создано: {formatDate(request.createdAt || request.submittedAt)}</p>
                  </div>
                  {canReview && (request.onecError || request.onecDocumentNumber) ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {request.onecDocumentNumber ? <p>Документ 1С: {request.onecDocumentNumber}</p> : null}
                      {request.onecError ? <p className="text-red-600">1С: {request.onecError}</p> : null}
                    </div>
                  ) : null}
                  {canReview && Array.isArray(request.history) && request.history.length > 0 ? (
                    <div className="mt-3 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-500">
                      {request.history.slice(-3).map((event, index) => (
                        <p key={`${event.at || 'event'}-${index}`}>
                          <span className="font-medium text-slate-600">{event.label || event.action || 'Этап'}</span>
                          {event.at ? ` · ${formatDate(event.at)}` : ''}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {canReview ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.status === 'ACCOUNTING_REVIEW' || request.status === 'ONEC_PENDING' ? (
                        <button
                          type="button"
                          onClick={() => void sendRequestToOneC(request)}
                          disabled={sendingOneCId === request.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {sendingOneCId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Передать в 1С
                        </button>
                      ) : null}
                      {canAdvance && !terminalStatuses.has(request.status) ? (
                        <button
                          type="button"
                          onClick={() => void advanceRequest(request)}
                          disabled={advancingId === request.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {advancingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                          Далее
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
