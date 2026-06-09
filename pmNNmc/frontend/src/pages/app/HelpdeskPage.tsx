import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, CalendarClock, ExternalLink, Headphones, RefreshCw, Tag, UserRound } from 'lucide-react';
import { useTicketStore } from '../../store/ticketStore';
import { useAuthStore, useUserRole } from '../../store/authStore';
import TicketStatusBadge from '../../components/tickets/TicketStatusBadge';
import TicketFilters from '../../components/tickets/TicketFilters';
import Loader from '../../components/ui/Loader';
import { subscribeToNotificationRealtime } from '../../api/notificationRealtime';

export default function HelpdeskPage() {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';
  const currentUser = useAuthStore((state) => state.user);
  const { isSuperAdmin } = useUserRole();
  const isKuat =
    currentUser?.username?.toLowerCase() === 'kuat' ||
    currentUser?.email?.toLowerCase() === 'kuat@nnmc.kz';
  const canFilterByAssignee = isSuperAdmin || isKuat;

  const { tickets, total, isLoading, error, fetchTickets, setFilters, filters, assignableUsers, fetchAssignableUsers } = useTicketStore();

  const [statusFilter, setStatusFilter] = useState(filters.status || 'ALL');
  const [searchFilter, setSearchFilter] = useState(filters.search || '');
  const [assigneeFilter, setAssigneeFilter] = useState<number | undefined>(filters.assigneeId);
  const [myTicketsOnly, setMyTicketsOnly] = useState(true);
  const [currentPage, setCurrentPage] = useState(filters.page || 1);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const doFetch = useCallback(
    (status: string, search: string, assigneeId?: number, myOnly?: boolean, page = 1) => {
      const f: any = {};
      if (status !== 'ALL') f.status = status;
      if (search) f.search = search;
      if (!myOnly && assigneeId) f.assigneeId = assigneeId;
      f.myTickets = myOnly;
      f.page = page;
      f.pageSize = PAGE_SIZE;
      setFilters(f);
      fetchTickets(f);
    },
    [fetchTickets, setFilters]
  );

  useEffect(() => {
    doFetch(statusFilter, searchFilter, assigneeFilter, myTicketsOnly, currentPage);
    if (canFilterByAssignee) {
      fetchAssignableUsers();
    }
  }, []);

  useEffect(() => {
    return subscribeToNotificationRealtime((payload) => {
      if (!payload.type?.startsWith('tickets:')) return;
      doFetch(statusFilter, searchFilter, assigneeFilter, myTicketsOnly, currentPage);
    });
  }, [doFetch, statusFilter, searchFilter, assigneeFilter, myTicketsOnly, currentPage]);

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
    doFetch(status, searchFilter, assigneeFilter, myTicketsOnly, 1);
  };

  const handleSearchChange = (search: string) => {
    setSearchFilter(search);
    if (searchTimeout) clearTimeout(searchTimeout);
    setCurrentPage(1);
    const timeout = setTimeout(() => doFetch(statusFilter, search, assigneeFilter, myTicketsOnly, 1), 300);
    setSearchTimeout(timeout);
  };

  const handleAssigneeChange = (id: number | undefined) => {
    setAssigneeFilter(id);
    setCurrentPage(1);
    doFetch(statusFilter, searchFilter, id, myTicketsOnly, 1);
  };

  const handleMyTicketsChange = (myOnly: boolean) => {
    setMyTicketsOnly(myOnly);
    if (myOnly) {
      setAssigneeFilter(undefined);
    }
    setCurrentPage(1);
    doFetch(statusFilter, searchFilter, myOnly ? undefined : assigneeFilter, myOnly, 1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
    doFetch(statusFilter, searchFilter, assigneeFilter, myTicketsOnly, page);
  };

  const getPageItems = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const items: Array<number | '...'> = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) items.push('...');
    for (let p = start; p <= end; p += 1) items.push(p);
    if (end < totalPages - 1) items.push('...');

    items.push(totalPages);
    return items;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryName = (ticket: any) => {
    if (!ticket.category) return '-';
    return lang === 'kz' ? ticket.category.name_kz : ticket.category.name_ru;
  };

  const getAssigneeName = (ticket: any) => {
    const assignees = Array.isArray(ticket.assignee)
      ? ticket.assignee
      : ticket.assignee
      ? [ticket.assignee]
      : [];
    if (assignees.length === 0) return '-';

    return assignees
      .map((a: any) =>
        a.firstName || a.lastName ? `${a.lastName || ''} ${a.firstName || ''}`.trim() : a.username
      )
      .join(', ');
  };

  const getUserName = (user: any) =>
    user?.firstName || user?.lastName
      ? `${user.lastName || ''} ${user.firstName || ''}`.trim()
      : user?.username || user?.email || '-';

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Headphones className="w-7 h-7 flex-shrink-0 text-cyan-600" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800">
              {t('helpdesk.title', 'Заявки')}
            </h1>
            <p className="text-sm text-slate-500">
              {t('helpdesk.subtitle', 'Управление заявками')} ({total})
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            onClick={() => doFetch(statusFilter, searchFilter, assigneeFilter, myTicketsOnly, currentPage)}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title={t('common.refresh', 'Обновить')}
            aria-label={t('common.refresh', 'Обновить')}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('/app/helpdesk/submit')}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white transition-colors hover:bg-cyan-700 sm:flex-none"
          >
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{t('helpdesk.publicForm', 'Форма подачи')}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <TicketFilters
        status={statusFilter}
        search={searchFilter}
        onStatusChange={handleStatusChange}
        onSearchChange={handleSearchChange}
        assigneeId={assigneeFilter}
        onAssigneeChange={handleAssigneeChange}
        assignableUsers={assignableUsers}
        showAssigneeFilter={canFilterByAssignee}
        myTicketsOnly={myTicketsOnly}
        onMyTicketsChange={handleMyTicketsChange}
      />

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Loading */}
      {isLoading && <Loader />}

      {/* Table */}
      {!isLoading && tickets.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Headphones className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>{t('helpdesk.noTickets', 'Заявок пока нет')}</p>
        </div>
      ) : (
        !isLoading && (
          <div className="space-y-3">
            <div className="space-y-3 lg:hidden">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => navigate(`/app/helpdesk/${ticket.documentId}`)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-bold leading-tight text-cyan-600">
                        {ticket.ticketNumber}
                      </p>
                      <p className="mt-1 truncate text-base font-semibold text-slate-800">
                        {ticket.requesterName}
                      </p>
                    </div>
                    <TicketStatusBadge status={ticket.status} className="flex-shrink-0" />
                  </div>

                  <div className="mt-4 space-y-2.5 text-sm text-slate-600">
                    <div className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span className="truncate">{ticket.requesterDepartment || '-'}</span>
                    </div>
                    <div className="flex min-w-0 items-start gap-2">
                      <Tag className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span className="min-w-0 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {getCategoryName(ticket)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 min-[420px]:grid-cols-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserRound className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{getAssigneeName(ticket)}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <CalendarClock className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{formatDate(ticket.createdAt)}</span>
                      </div>
                    </div>
                    {ticket.completedBy && (
                      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                        Закрыл: {getUserName(ticket.completedBy)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.ticketNumber', '№')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.requesterName', 'ФИО')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.requesterDepartment', 'Отдел')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.category', 'Категория')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.status', 'Статус')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.assignee', 'Исполнитель')}
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        Закрыл
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">
                        {t('helpdesk.createdAt', 'Дата')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr
                        key={ticket.id}
                        onClick={() => navigate(`/app/helpdesk/${ticket.documentId}`)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-cyan-600 font-medium">
                          {ticket.ticketNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{ticket.requesterName}</td>
                        <td className="px-4 py-3 text-slate-600">{ticket.requesterDepartment}</td>
                        <td className="px-4 py-3 text-slate-600">{getCategoryName(ticket)}</td>
                        <td className="px-4 py-3">
                          <TicketStatusBadge status={ticket.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">{getAssigneeName(ticket)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {ticket.completedBy ? (
                            <div>
                              <div>{getUserName(ticket.completedBy)}</div>
                              <div className="text-xs text-slate-400">{formatDate(ticket.completedAt || ticket.updatedAt)}</div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {formatDate(ticket.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-1 sm:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {t('common.back', 'Назад')}
              </button>
              <p className="min-w-[72px] text-center text-sm font-medium text-slate-600">
                {currentPage} / {totalPages}
              </p>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {t('survey.next', 'Далее')}
              </button>
            </div>

            <div className="hidden items-center justify-between px-2 sm:flex">
              <p className="text-xs text-slate-500">
                {currentPage} / {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  {t('common.back', 'Назад')}
                </button>
                {getPageItems().map((item, idx) =>
                  item === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => handlePageChange(item)}
                      className={`min-w-9 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                        item === currentPage
                          ? 'bg-cyan-600 border-cyan-600 text-white'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  {t('survey.next', 'Далее')}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
