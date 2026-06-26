import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  Hash,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import {
  employeeCardsApi,
  type EmployeeCard,
  type EmployeeSyncStatus,
} from '../../api/employeeCards';
import { useUserRole } from '../../store/authStore';

const PAGE_SIZE = 25;

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(date);
}

function formatMoney(value?: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function syncStatusLabel(status?: string): string {
  if (status === 'completed') return 'Успешно';
  if (status === 'failed') return 'Ошибка';
  if (status === 'running') return 'Выполняется';
  return 'Ещё не запускалась';
}

function issueText(issue: Record<string, unknown>, index: number): string {
  const message = String(issue.message || issue.reason || '').trim();
  const fio = String(issue.fio || issue.employee || issue.employeeName || '').trim();
  const iin = String(issue.iin || '').trim();
  const code = String(issue.code || '').trim();
  const title = fio || (iin ? `ИИН ${iin}` : code || `Проблема ${index + 1}`);
  return message ? `${index + 1}. ${title}: ${message}` : `${index + 1}. ${title}`;
}

export default function EmployeeDirectoryPage() {
  const { canSyncEmployeeDirectory } = useUserRole();
  const [cards, setCards] = useState<EmployeeCard[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [department, setDepartment] = useState('');
  const [active, setActive] = useState<'true' | 'false' | 'all'>('true');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [status, setStatus] = useState<EmployeeSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await employeeCardsApi.list({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        department: department || undefined,
        active,
      });
      setCards(response.items);
      setDepartments(response.meta.departments || []);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить сотрудников');
    } finally {
      setLoading(false);
    }
  }, [active, department, page, search]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await employeeCardsApi.syncStatus();
      setStatus(response);
      setSyncing(response.running);
    } catch {
      // The list error is more useful than a secondary status error.
    }
  }, []);

  useEffect(() => {
    void loadCards();
    void loadStatus();
  }, [loadCards, loadStatus]);

  const latestStats = status?.latest?.stats || {};
  const latestIssues = status?.latest?.issues || [];
  const issueCount = latestIssues.length;
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  const summary = useMemo(
    () => [
      { label: 'Карточек', value: total, icon: Users },
      {
        label: 'Мест работы',
        value: Number(latestStats.workplaceCount || 0),
        icon: Briefcase,
      },
      {
        label: 'Проблем последней синхронизации',
        value: issueCount,
        icon: AlertTriangle,
      },
    ],
    [issueCount, latestStats.workplaceCount, total]
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleSync = async () => {
    if (!window.confirm('Загрузить актуальные карточки сотрудников из 1С?')) return;
    setSyncing(true);
    setError('');
    try {
      const result = await employeeCardsApi.sync();
      await Promise.all([loadCards(), loadStatus()]);
      const issueLines = (result.issues || [])
        .slice(0, 5)
        .map(issueText)
        .join('\n');
      window.alert(
        `Синхронизация завершена.\n` +
        `Создано: ${result.stats.created || 0}\n` +
        `Обновлено: ${result.stats.updated || 0}\n` +
        `Без изменений: ${result.stats.unchanged || 0}\n` +
        `Деактивировано: ${result.stats.deactivated || 0}\n` +
        `Проблем: ${result.issues?.length || 0}` +
        (issueLines ? `\n\nПервые проблемы:\n${issueLines}` : '')
      );
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Синхронизация не выполнена');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">Сотрудники</h1>
          <p className="mt-1 text-sm text-slate-500">
            Одна карточка на ИИН. Табельные номера и места работы загружаются из 1С.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Последняя синхронизация: {formatDate(status?.latest?.finishedAt || status?.latest?.startedAt)}
            {' · '}
            {syncStatusLabel(status?.latest?.status)}
          </p>
        </div>
        {canSyncEmployeeDirectory && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Синхронизация...' : 'Синхронизировать с 1С'}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {latestIssues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Проблемы последней синхронизации
          </div>
          <p className="mb-3 text-amber-800">
            Эти записи не были загружены как полноценные карточки. Уже созданные сотрудники не удалялись.
          </p>
          <ol className="space-y-1">
            {latestIssues.slice(0, 20).map((issue, index) => (
              <li key={index}>{issueText(issue, index)}</li>
            ))}
          </ol>
          {latestIssues.length > 20 && (
            <p className="mt-2 text-amber-800">Показаны первые 20 из {latestIssues.length}.</p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={submitSearch} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(220px,320px)_180px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ФИО, ИИН или табельный номер"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
          >
            <option value="">Все подразделения</option>
            {departments.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={active}
            onChange={(event) => {
              setActive(event.target.value as 'true' | 'false' | 'all');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
          >
            <option value="true">Только активные</option>
            <option value="false">Только неактивные</option>
            <option value="all">Все сотрудники</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-teal-600 px-5 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
          >
            Найти
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Сотрудник</th>
                <th className="px-4 py-3">ИИН</th>
                <th className="px-4 py-3">Основное место работы</th>
                <th className="px-4 py-3">Табельные номера</th>
                <th className="px-4 py-3">Оклад</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Загрузка сотрудников...
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    Сотрудники не найдены
                  </td>
                </tr>
              ) : cards.map((card) => {
                const primary = card.primaryWorkplace;
                const expanded = expandedId === card.id;
                return (
                  <Fragment key={card.id}>
                    <tr className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{card.fio}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {card.birthDate ? `Дата рождения: ${formatDate(card.birthDate)}` : ''}
                          {card.gender ? ` · ${card.gender}` : ''}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{card.iin}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{primary?.department || '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">{primary?.position || 'Должность не указана'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {card.workplaces.map((workplace) => workplace.personnelNumber).filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        {formatMoney(primary?.salary)} ₸
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : card.id)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-label="Показать места работы"
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid gap-3 lg:grid-cols-2">
                            {card.workplaces.map((workplace, index) => (
                              <div
                                key={workplace.employeeId || `${card.id}-${index}`}
                                className="rounded-xl border border-slate-200 bg-white p-4"
                              >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                                    <Hash className="h-4 w-4 text-teal-600" />
                                    Таб. № {workplace.personnelNumber || '—'}
                                  </div>
                                  {workplace.primary && (
                                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                                      Основное место
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-2 text-sm text-slate-600">
                                  <p className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0" />{workplace.department || 'Подразделение не указано'}</p>
                                  <p className="flex gap-2"><Briefcase className="mt-0.5 h-4 w-4 shrink-0" />{workplace.position || 'Должность не указана'} · {workplace.employmentType || 'Вид занятости не указан'} · {workplace.rate} ставки</p>
                                  <p className="flex gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0" />Оклад: {formatMoney(workplace.salary)} ₸ · ФОТ: {formatMoney(workplace.payroll)} ₸</p>
                                  <p>График: {workplace.schedule || '—'}</p>
                                  <p>Приём: {formatDate(workplace.hireDate)} · Увольнение: {formatDate(workplace.dismissalDate)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-slate-500">Показано {pageStart}–{pageEnd} из {total}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-40"
            >
              Назад
            </button>
            <span className="px-2 py-2 text-slate-600">{page} / {Math.max(totalPages, 1)}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-40"
            >
              Далее
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
