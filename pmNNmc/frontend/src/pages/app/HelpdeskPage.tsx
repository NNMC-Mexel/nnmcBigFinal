import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Headphones, RefreshCw, ExternalLink } from 'lucide-react';
import { useTicketStore } from '../../store/ticketStore';
import { useUserRole } from '../../store/authStore';
import TicketStatusBadge from '../../components/tickets/TicketStatusBadge';
import TicketFilters from '../../components/tickets/TicketFilters';
import Loader from '../../components/ui/Loader';

export default function HelpdeskPage() {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';
  const { isLead, isAdmin, isSuperAdmin } = useUserRole();
  const canFilterByAssignee = isLead || isAdmin || isSuperAdmin;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Headphones className="w-7 h-7 text-cyan-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {t('helpdesk.title', 'Заявки')}
            </h1>
            <p className="text-sm text-slate-500">
              {t('helpdesk.subtitle', 'Управление заявками')} ({total})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => doFetch(statusFilter, searchFilter, assigneeFilter, myTicketsOnly, currentPage)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('common.refresh', 'Обновить')}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <a
            href="/helpdesk/submit"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('helpdesk.publicForm', 'Форма подачи')}
          </a>
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
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatDate(ticket.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            <div className="flex items-center justify-between px-2">
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
