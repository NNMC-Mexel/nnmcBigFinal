import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '../../api/tickets';
import type { Ticket, AssignableUser } from '../../types';
import Loader from '../../components/ui/Loader';
import { useUserRole } from '../../store/authStore';

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
    if (effectiveDepartmentKey === 'ENGINEERING') return 'KPI Инженерная служба';
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
        const hay = `${ticket.ticketNumber} ${ticket.requesterName} ${ticket.requesterDepartment} ${ticket.comment}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [tickets, selectedUserId, search, rangeMode, year, month, monthKeyNow, monthKeyPrev]);

  const years = useMemo(() => {
    const unique = new Set<number>();
    tickets.forEach((t) => {
      if (t.createdAt) unique.add(new Date(t.createdAt).getFullYear());
    });
    return Array.from(unique).sort((a, b) => b - a);
  }, [tickets]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const stats = useMemo(() => {
    const done = filtered.filter((t) => t.status === 'DONE');
    const inProgress = filtered.filter((t) => t.status === 'IN_PROGRESS').length;
    const newly = filtered.filter((t) => t.status === 'NEW').length;
    const invalid = filtered.filter((t) => t.status === 'INVALID').length;
    const avgDoneMinutes =
      done.length > 0
        ? Math.round(
            done.reduce((sum, t) => sum + toMinutesDiff(t.createdAt, t.updatedAt), 0) / done.length
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
      ['Сотрудник', 'Номер', 'Заявитель', 'Отдел', 'Создано', 'Обновлено', 'Статус', 'Время (мин)', 'Время (формат)'],
      ...filtered.map((ticket) => {
        const actual = toMinutesDiff(ticket.createdAt, ticket.updatedAt);
        return [
          selectedUser ? toUserName(selectedUser) : '',
          ticket.ticketNumber,
          ticket.requesterName,
          ticket.requesterDepartment,
          formatDateTime(ticket.createdAt),
          formatDateTime(ticket.updatedAt),
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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{departmentTitle}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
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

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-800">Заявки {selectedUser ? toUserName(selectedUser) : ''}</p>
                <p className="text-sm text-slate-500">Всего записей: {filtered.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('common.search', 'Поиск')}
                    className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-64"
                  />
                </div>
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
                >
                  <Download className="w-4 h-4" />
                  Скачать отчет
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setRangeMode('custom');
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(Number(e.target.value));
                  setRangeMode('custom');
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setRangeMode('current')}
                className={`px-3 py-2 rounded-lg text-sm border ${rangeMode === 'current' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Текущий месяц
              </button>
              <button
                onClick={() => setRangeMode('previous')}
                className={`px-3 py-2 rounded-lg text-sm border ${rangeMode === 'previous' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Прошлый месяц
              </button>
              <button
                onClick={() => setRangeMode('all')}
                className={`px-3 py-2 rounded-lg text-sm border ${rangeMode === 'all' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'border-slate-300 text-slate-600'}`}
              >
                Весь период
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
              <div className="rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2">
                <p className="text-xs text-cyan-700">Среднее (done)</p>
                <p className="text-lg font-semibold text-cyan-800">{formatDuration(stats.avgDoneMinutes)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Имя сотрудника</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Номер</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Дата создания</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Дата обновления</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Время выполнения</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">KPI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ticket) => {
                  const actual = toMinutesDiff(ticket.createdAt, ticket.updatedAt);
                  const kpi = getKpiState(ticket.status);

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-slate-800">{selectedUser ? toUserName(selectedUser) : '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.ticketNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('ru-RU') : '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString('ru-RU') : '-'}</td>
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
                  {selectedTicket.updatedAt ? new Date(selectedTicket.updatedAt).toLocaleString('ru-RU') : 'N/A'}
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
