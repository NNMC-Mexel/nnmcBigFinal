import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Download, Hash, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '../../api/tickets';
import type { Ticket, AssignableUser } from '../../types';
import Loader from '../../components/ui/Loader';
import { useUserRole } from '../../store/authStore';
import ComboboxSelect, { type ComboboxOption } from '../../components/ui/ComboboxSelect';

type RangeMode = 'current' | 'previous' | 'all' | 'custom';
type DepartmentKey = 'IT' | 'MEDICAL_EQUIPMENT' | 'ENGINEERING';

interface KpiPageProps {
  forcedDepartmentKey?: DepartmentKey;
  title?: string;
}

const toUserName = (user: { username: string; firstName?: string; lastName?: string }) =>
  `${user.lastName || ''} ${user.firstName || ''}`.trim() || user.username;

const toMinutesDiff = (from?: string, to?: string) => {
  if (!from) return 0;
  const start = new Date(from).getTime();
  const end = new Date(to || Date.now()).getTime();
  return Math.max(0, Math.floor((end - start) / 60000));
};

const formatDuration = (minutes: number) => {
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  return `${days} д ${hours} ч ${mins} мин`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusRu: Record<Ticket['status'], string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнено',
  INVALID: 'Некорректная',
};

const getTicketCategoryName = (ticket: Ticket) =>
  ticket.category?.name_ru || ticket.category?.name_kz || ticket.serviceGroup?.name_ru || ticket.serviceGroup?.name_kz || '-';

const getTicketComplexity = (ticket: Ticket) => ticket.complexity || '-';

const toMonthKey = (date?: string) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const toCsv = (rows: string[][], separator = ';') =>
  rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`)
        .join(separator)
    )
    .join('\n');

const getKpiState = (status: Ticket['status']) => {
  if (status === 'DONE') {
    return { label: 'Сделано', color: 'bg-green-100 text-green-700' };
  }
  if (status === 'IN_PROGRESS') {
    return { label: 'В работе', color: 'bg-amber-100 text-amber-700' };
  }
  if (status === 'INVALID') {
    return { label: 'Некорректная', color: 'bg-red-100 text-red-700' };
  }
  return { label: 'Новая заявка', color: 'bg-slate-100 text-slate-700' };
};

const MONTH_OPTIONS: ComboboxOption[] = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2024, i, 1).toLocaleDateString('ru-RU', { month: 'long' }),
}));

export default function KpiItPage({ forcedDepartmentKey, title }: KpiPageProps) {
  const { t } = useTranslation();
  const { departmentKey } = useUserRole();
  const [isLoading, setIsLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('current');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const effectiveDepartmentKey = useMemo<DepartmentKey>(() => {
    if (forcedDepartmentKey) return forcedDepartmentKey;
    if (departmentKey === 'MEDICAL_EQUIPMENT') return 'MEDICAL_EQUIPMENT';
    if (departmentKey === 'ENGINEERING') return 'ENGINEERING';
    return 'IT';
  }, [departmentKey, forcedDepartmentKey]);

  const departmentTitle = useMemo(() => {
    if (title) return title;
    if (effectiveDepartmentKey === 'MEDICAL_EQUIPMENT') return 'KPI Медоборудование';
    if (effectiveDepartmentKey === 'ENGINEERING') return 'KPI Хозяйственная служба';
    return 'KPI IT';
  }, [effectiveDepartmentKey, title]);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const pageSize = 100;
        const first = await ticketsApi.getAll({ page: 1, pageSize });
        const all = [...first.data];
        const totalPages = Math.ceil((first.total || 0) / pageSize);
        for (let page = 2; page <= totalPages; page += 1) {
          const next = await ticketsApi.getAll({ page, pageSize });
          all.push(...next.data);
        }
        const assignable = await ticketsApi.getAssignableUsers();
        const deptUsers = assignable.filter((u) => u.department?.key === effectiveDepartmentKey);
        setTickets(all);
        setUsers(deptUsers);
        if (deptUsers[0]) {
          setSelectedUserId(deptUsers[0].id);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [effectiveDepartmentKey]);

  const monthKeyNow = toMonthKey(new Date().toISOString());
  const monthKeyPrev = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toMonthKey(d.toISOString());
  })();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const customKey = `${year}-${String(month).padStart(2, '0')}`;

    return tickets
      .filter((ticket) => {
        if (!selectedUserId) return false;
        const assignees = Array.isArray(ticket.assignee) ? ticket.assignee : [];
        return assignees.some((a) => a.id === selectedUserId);
      })
      .filter((ticket) => {
        const key = toMonthKey(ticket.createdAt);
        if (rangeMode === 'all') return true;
        if (rangeMode === 'current') return key === monthKeyNow;
        if (rangeMode === 'previous') return key === monthKeyPrev;
        return key === customKey;
      })
      .filter((ticket) => {
        if (!q) return true;
        const hay = `${ticket.ticketNumber} ${ticket.requesterName} ${ticket.requesterDepartment} ${getTicketCategoryName(ticket)} ${ticket.comment}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [tickets, selectedUserId, search, rangeMode, year, month, monthKeyNow, monthKeyPrev]);

  const years = useMemo(() => {
    const unique = new Set<number>();
    tickets.forEach((t) => {
      if (t.createdAt) unique.add(new Date(t.createdAt).getFullYear());
    });
    if (unique.size === 0) unique.add(new Date().getFullYear());
    return Array.from(unique).sort((a, b) => b - a);
  }, [tickets]);
  const yearOptions: ComboboxOption[] = years.map((y) => ({ value: String(y), label: String(y) }));
  const userOptions: ComboboxOption[] = users.map((user) => ({
    value: String(user.id),
    label: toUserName(user),
    description: user.email || user.department?.name_ru || user.department?.name_kz,
  }));

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const stats = useMemo(() => {
    const done = filtered.filter((t) => t.status === 'DONE');
    const inProgress = filtered.filter((t) => t.status === 'IN_PROGRESS').length;
    const newly = filtered.filter((t) => t.status === 'NEW').length;
    const invalid = filtered.filter((t) => t.status === 'INVALID').length;
    const avgDoneMinutes =
      done.length > 0
        ? Math.round(
            done.reduce((sum, t) => sum + toMinutesDiff(t.createdAt, t.completedAt || t.updatedAt), 0) / done.length
          )
        : 0;
    return { done: done.length, inProgress, newly, invalid, avgDoneMinutes };
  }, [filtered]);

  const exportCsv = () => {
    const periodLabel =
      rangeMode === 'all'
        ? 'Весь период'
        : rangeMode === 'current'
        ? 'Текущий месяц'
        : rangeMode === 'previous'
        ? 'Прошлый месяц'
        : `${month.toString().padStart(2, '0')}.${year}`;

    const generatedAt = new Date().toLocaleString('ru-RU');
    const rows = [
      [`Отчет ${departmentTitle}`],
      ['Сотрудник', selectedUser ? toUserName(selectedUser) : '—'],
      ['Период', periodLabel],
      ['Сформирован', generatedAt],
      [],
      ['Сводка'],
      ['Сделано', String(stats.done)],
      ['В работе', String(stats.inProgress)],
      ['Новые', String(stats.newly)],
      ['Некорректные', String(stats.invalid)],
      ['Среднее время (done)', formatDuration(stats.avgDoneMinutes)],
      [],
      ['Таблица заявок'],
      ['Сотрудник', 'Номер', 'Категория заявки', 'Сложность', 'Заявитель', 'Отдел', 'Создано', 'Обновлено', 'Статус', 'Время (мин)', 'Время (формат)'],
      ...filtered.map((ticket) => {
        const actual = toMinutesDiff(ticket.createdAt, ticket.completedAt || ticket.updatedAt);
        return [
          selectedUser ? toUserName(selectedUser) : '',
          ticket.ticketNumber,
          getTicketCategoryName(ticket),
          getTicketComplexity(ticket),
          ticket.requesterName,
          ticket.requesterDepartment,
          formatDateTime(ticket.createdAt),
          formatDateTime(ticket.completedAt || ticket.updatedAt),
          statusRu[ticket.status] || ticket.status,
          String(actual),
          formatDuration(actual),
        ];
      }),
    ];
    const csvContent = `\uFEFF${toCsv(rows)}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeUser = (selectedUser ? toUserName(selectedUser) : 'all')
      .replace(/\s+/g, '_')
      .replace(/[^\w\-а-яА-ЯёЁ]/g, '');
    const deptSlug =
      effectiveDepartmentKey === 'MEDICAL_EQUIPMENT'
        ? 'medical-equipment'
        : effectiveDepartmentKey === 'ENGINEERING'
        ? 'engineering'
        : 'it';
    a.download = `kpi-${deptSlug}_${safeUser}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Loader />;

  const renderTicketCard = (ticket: Ticket) => {
    const actual = toMinutesDiff(ticket.createdAt, ticket.completedAt || ticket.updatedAt);
    const kpi = getKpiState(ticket.status);

    return (
      <button
        key={ticket.id}
        type="button"
        onClick={() => setSelectedTicket(ticket)}
        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-lg font-bold leading-tight text-cyan-700">
              {ticket.ticketNumber}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-slate-800">
              {selectedUser ? toUserName(selectedUser) : '-'}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${kpi.color}`}>
            {kpi.label}
          </span>
        </div>

        <div className="mt-4 space-y-2.5 text-sm text-slate-600">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="truncate">{formatDateTime(ticket.createdAt) || '-'}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="truncate">{formatDuration(actual)}</span>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Hash className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="min-w-0 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {getTicketCategoryName(ticket)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Hash className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="truncate">Сложность: {getTicketComplexity(ticket)}</span>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Hash className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="min-w-0 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {ticket.requesterName} · {ticket.requesterDepartment}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-800">{departmentTitle}</h1>
        <p className="mt-1 text-sm text-slate-500 lg:hidden">
          {selectedUser ? toUserName(selectedUser) : 'Выберите сотрудника'} · {filtered.length} записей
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
        <p className="mb-2 text-sm font-semibold text-slate-800">Сотрудник</p>
        <ComboboxSelect
          value={selectedUserId ? String(selectedUserId) : ''}
          onChange={(nextValue) => setSelectedUserId(nextValue ? Number(nextValue) : null)}
          options={userOptions}
          placeholder="Выберите сотрудника"
          searchable={users.length > 6}
          searchPlaceholder="Поиск сотрудника..."
          emptyText="Сотрудники не найдены"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="hidden rounded-xl border border-slate-200 bg-white p-4 lg:block">
          <p className="font-semibold text-slate-800 mb-3">Сотрудники</p>
          <div className="space-y-1 max-h-[560px] overflow-auto">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedUserId === u.id ? 'bg-slate-100 text-slate-900 font-medium' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                {toUserName(u)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white">
          <div className="space-y-4 border-b border-slate-100 p-4">
            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-800">
                  Заявки {selectedUser ? toUserName(selectedUser) : ''}
                </p>
                <p className="text-sm text-slate-500">Всего записей: {filtered.length}</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row xl:items-center">
                <div className="relative w-full sm:min-w-[220px] xl:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('common.search', 'Поиск')}
                    className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
                <button
                  onClick={exportCsv}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  Скачать отчет
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <ComboboxSelect
                value={String(year)}
                onChange={(nextValue) => {
                  setYear(Number(nextValue));
                  setRangeMode('custom');
                }}
                options={yearOptions}
                className="min-w-0 sm:w-32"
              />
              <ComboboxSelect
                value={String(month)}
                onChange={(nextValue) => {
                  setMonth(Number(nextValue));
                  setRangeMode('custom');
                }}
                options={MONTH_OPTIONS}
                className="min-w-0 sm:w-44"
              />
              <button
                onClick={() => setRangeMode('current')}
                className={`h-11 rounded-lg border px-3 text-sm font-medium sm:w-auto ${rangeMode === 'current' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Текущий месяц
              </button>
              <button
                onClick={() => setRangeMode('previous')}
                className={`h-11 rounded-lg border px-3 text-sm font-medium sm:w-auto ${rangeMode === 'previous' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Прошлый месяц
              </button>
              <button
                onClick={() => setRangeMode('all')}
                className={`col-span-2 h-11 rounded-lg border px-3 text-sm font-medium sm:col-span-1 sm:w-auto ${rangeMode === 'all' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Весь период
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">Сделано</p>
                <p className="text-lg font-semibold text-slate-800">{stats.done}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">В работе</p>
                <p className="text-lg font-semibold text-slate-800">{stats.inProgress}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">Новые</p>
                <p className="text-lg font-semibold text-slate-800">{stats.newly}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">Некорректные</p>
                <p className="text-lg font-semibold text-slate-800">{stats.invalid}</p>
              </div>
              <div className="col-span-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 md:col-span-1">
                <p className="text-xs text-cyan-700">Среднее (done)</p>
                <p className="break-words text-lg font-semibold text-cyan-800">{formatDuration(stats.avgDoneMinutes)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-slate-50/50 p-3 md:hidden">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Нет заявок за выбранный период
              </div>
            ) : (
              filtered.map(renderTicketCard)
            )}
          </div>

          <div className="hidden overflow-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Имя сотрудника</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Номер</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Категория заявки</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Сложность</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Дата создания</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Дата обновления</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Время выполнения</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">KPI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ticket) => {
                  const actual = toMinutesDiff(ticket.createdAt, ticket.completedAt || ticket.updatedAt);
                  const kpi = getKpiState(ticket.status);

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-slate-800">{selectedUser ? toUserName(selectedUser) : '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.ticketNumber}</td>
                      <td className="px-4 py-3 text-slate-700">{getTicketCategoryName(ticket)}</td>
                      <td className="px-4 py-3 text-slate-700">{getTicketComplexity(ticket)}</td>
                      <td className="px-4 py-3 text-slate-600">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('ru-RU') : '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{ticket.completedAt || ticket.updatedAt ? new Date(ticket.completedAt || ticket.updatedAt || '').toLocaleString('ru-RU') : '-'}</td>
                      <td className="px-4 py-3">
                        <div className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {formatDuration(actual)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${kpi.color}`}>
                          {kpi.label}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedTicket && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTicket(null)}>
          <div
            className="bg-white rounded-xl border border-slate-200 w-full max-w-4xl max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">
                Заявка {selectedTicket.ticketNumber}
              </h3>
              <button onClick={() => setSelectedTicket(null)} className="text-slate-500 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">ФИО</p>
                <p className="text-lg text-slate-800">{selectedTicket.requesterName}</p>
                <p className="text-sm text-slate-500 mt-4">Телефон</p>
                <p className="text-lg text-slate-800">{selectedTicket.requesterPhone || 'N/A'}</p>
                <p className="text-sm text-slate-500 mt-4">Отдел</p>
                <p className="text-lg text-slate-800">{selectedTicket.requesterDepartment}</p>
                <p className="text-sm text-slate-500 mt-4">Категория заявки</p>
                <p className="text-lg text-slate-800">{getTicketCategoryName(selectedTicket)}</p>
                <p className="text-sm text-slate-500 mt-4">Сложность</p>
                <p className="text-lg text-slate-800">{getTicketComplexity(selectedTicket)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Исполнители</p>
                <p className="text-lg text-slate-800">
                  {(selectedTicket.assignee || []).map(toUserName).join(', ') || 'N/A'}
                </p>
                <p className="text-sm text-slate-500 mt-4">Дата создания</p>
                <p className="text-lg text-slate-800">
                  {selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleString('ru-RU') : 'N/A'}
                </p>
                <p className="text-sm text-slate-500 mt-4">Дата обновления</p>
                <p className="text-lg text-slate-800">
                  {selectedTicket.completedAt || selectedTicket.updatedAt ? new Date(selectedTicket.completedAt || selectedTicket.updatedAt || '').toLocaleString('ru-RU') : 'N/A'}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 mb-2">Комментарий пользователя</p>
              <div className="bg-slate-50 rounded-lg p-3 text-slate-700 whitespace-pre-wrap">
                {selectedTicket.comment}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
