import { useTranslation } from 'react-i18next';
import { Search, X, User, Users } from 'lucide-react';
import type { AssignableUser } from '../../types';

const STATUSES = ['ALL', 'NEW', 'IN_PROGRESS', 'DONE', 'INVALID'] as const;

const STATUS_LABELS: Record<string, string> = {
  ALL: 'Все',
  NEW: 'Новые',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнено',
  INVALID: 'Некорректные',
};

interface Props {
  status: string;
  search: string;
  onStatusChange: (status: string) => void;
  onSearchChange: (search: string) => void;
  // New props for assignee filtering
  assigneeId?: number;
  onAssigneeChange?: (assigneeId: number | undefined) => void;
  assignableUsers?: AssignableUser[];
  showAssigneeFilter?: boolean;
  myTicketsOnly?: boolean;
  onMyTicketsChange?: (myOnly: boolean) => void;
}

export default function TicketFilters({
  status,
  search,
  onStatusChange,
  onSearchChange,
  assigneeId,
  onAssigneeChange,
  assignableUsers = [],
  showAssigneeFilter = false,
  myTicketsOnly = true,
  onMyTicketsChange,
}: Props) {
  const { t } = useTranslation();

  const getUserLabel = (user: AssignableUser) => {
    const fullName = `${user.lastName || ''} ${user.firstName || ''}`.trim();
    return fullName || user.username;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                status === s
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t(`helpdesk.filter${s === 'ALL' ? 'All' : s === 'NEW' ? 'New' : s === 'IN_PROGRESS' ? 'InProgress' : s === 'DONE' ? 'Done' : 'Invalid'}`, STATUS_LABELS[s])}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('helpdesk.searchPlaceholder', 'Поиск по ФИО, номеру, отделу...')}
            className="w-full pl-10 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Assignee filter row - only for leads/admins */}
      {showAssigneeFilter && (
        <div className="flex flex-wrap gap-3 items-center">
          {/* My tickets / All tickets toggle */}
          {onMyTicketsChange && (
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => onMyTicketsChange(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  myTicketsOnly
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <User className="w-4 h-4" />
                {t('helpdesk.myTickets', 'Мои заявки')}
              </button>
              <button
                onClick={() => onMyTicketsChange(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !myTicketsOnly
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                {t('helpdesk.allTickets', 'Все заявки')}
              </button>
            </div>
          )}

          {/* Assignee dropdown - only visible when viewing all tickets */}
          {!myTicketsOnly && onAssigneeChange && assignableUsers.length > 0 && (
            <select
              value={assigneeId || ''}
              onChange={(e) => onAssigneeChange(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
            >
              <option value="">{t('helpdesk.allAssignees', 'Все исполнители')}</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {getUserLabel(user)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
