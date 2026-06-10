import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2, Search, Users, X } from 'lucide-react';
import { departmentsApi } from '../../api/departments';
import type { ReassignTicketPayload } from '../../api/tickets';
import type { AssignableUser, Department } from '../../types';
import ComboboxSelect, { type ComboboxOption } from '../ui/ComboboxSelect';

const HELP_SERVICE_DEPARTMENT_KEYS = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (payload: ReassignTicketPayload) => Promise<void>;
  users: AssignableUser[];
  currentAssigneeIds?: number[];
  currentDepartmentId?: number;
  currentTargetDepartmentId?: number;
  canTransferDepartments?: boolean;
  useTicketDepartmentUsers?: boolean;
}

export default function ReassignModal({
  isOpen,
  onClose,
  onAssign,
  users,
  currentAssigneeIds = [],
  currentDepartmentId,
  currentTargetDepartmentId,
  canTransferDepartments = false,
  useTicketDepartmentUsers = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';
  const [mode, setMode] = useState<'users' | 'department'>('users');
  const [search, setSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>(currentAssigneeIds);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | ''>('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('users');
    setSearch('');
    setSelectedUserIds(currentAssigneeIds);
    setSelectedDepartmentId('');
    setReason('');
    if (canTransferDepartments) {
      departmentsApi
        .getAll()
        .then((items) => setDepartments(items))
        .catch(() => setDepartments([]));
    } else {
      setDepartments([]);
    }
  }, [isOpen, currentAssigneeIds, canTransferDepartments]);

  const assignmentDepartmentId = useTicketDepartmentUsers
    ? currentTargetDepartmentId
    : currentDepartmentId;
  const ownDepartmentUsers = useMemo(() => {
    if (!assignmentDepartmentId) return users;
    return users.filter((user) => Number(user.department?.id) === Number(assignmentDepartmentId));
  }, [users, assignmentDepartmentId]);
  const ownDepartmentUserIds = useMemo(
    () => new Set(ownDepartmentUsers.map((user) => user.id)),
    [ownDepartmentUsers]
  );

  useEffect(() => {
    if (!isOpen || mode !== 'users') return;
    setSelectedUserIds((prev) => prev.filter((id) => ownDepartmentUserIds.has(id)));
  }, [isOpen, mode, ownDepartmentUserIds]);

  const filteredUsers = ownDepartmentUsers.filter((user) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const fullName = `${user.firstName || ''} ${user.lastName || ''} ${user.username} ${user.email || ''}`.toLowerCase();
    return fullName.includes(term);
  });

  const getDepartmentName = (department?: Department | null) => {
    if (!department) return '';
    return lang === 'kz' ? department.name_kz || department.name_ru : department.name_ru || department.name_kz;
  };

  const transferDepartments = departments
    .filter((department) => HELP_SERVICE_DEPARTMENT_KEYS.includes(department.key))
    .filter((department) => Number(department.id) !== Number(currentTargetDepartmentId || currentDepartmentId))
    .sort((a, b) => (a.name_ru || '').localeCompare(b.name_ru || '', 'ru'));
  const transferDepartmentOptions: ComboboxOption[] = transferDepartments.map((department) => ({
    value: String(department.id),
    label: getDepartmentName(department),
    description: department.key,
  }));

  if (!isOpen) return null;

  const getUserDisplayName = (user: AssignableUser) => {
    if (user.firstName || user.lastName) {
      return `${user.lastName || ''} ${user.firstName || ''}`.trim();
    }
    return user.username;
  };

  const toggleUser = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const canApply =
    mode === 'users'
      ? selectedUserIds.length > 0
      : Boolean(canTransferDepartments && selectedDepartmentId && reason.trim().length >= 3);

  const handleApply = async () => {
    if (!canApply) return;
    setIsAssigning(true);
    try {
      const payload: ReassignTicketPayload =
        mode === 'users'
          ? { assigneeIds: selectedUserIds }
          : { departmentId: Number(selectedDepartmentId), reason: reason.trim() };
      await onAssign(payload);
      onClose();
    } catch (error) {
      console.error('Failed to reassign:', error);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[86vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">
            {t('helpdesk.reassign', 'Переназначить')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common.close', 'Закрыть')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100">
          <div className={`grid gap-2 rounded-xl bg-slate-100 p-1 ${canTransferDepartments ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => setMode('users')}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'users' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Users className="h-4 w-4" />
              {useTicketDepartmentUsers ? 'Исполнители отдела' : t('helpdesk.myDepartment', 'Мой отдел')}
            </button>
            {canTransferDepartments && (
              <button
                type="button"
                onClick={() => setMode('department')}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'department' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Building2 className="h-4 w-4" />
                {t('helpdesk.otherDepartment', 'Другой отдел')}
              </button>
            )}
          </div>
        </div>

        {mode === 'users' ? (
          <>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('helpdesk.searchUser', 'Поиск по имени...')}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredUsers.length === 0 ? (
                <p className="text-center text-slate-500 py-8 text-sm">
                  {useTicketDepartmentUsers
                    ? 'Нет доступных исполнителей'
                    : t('helpdesk.noUsersInDepartment', 'В вашем отделе нет доступных исполнителей')}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.map((user) => {
                    const isCurrent = currentAssigneeIds.includes(user.id);
                    const isSelected = selectedUserIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        disabled={isAssigning}
                        onClick={() => toggleUser(user.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-cyan-50 text-cyan-800'
                            : isAssigning
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-sm font-medium text-slate-600">
                          {(user.firstName?.[0] || user.username[0]).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{getUserDisplayName(user)}</p>
                          {user.department && (
                            <p className="text-xs text-slate-500 truncate">{getDepartmentName(user.department)}</p>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 text-xs ${
                            isSelected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected ? '✓' : ''}
                        </div>
                        {isCurrent && !isSelected && (
                          <span className="text-xs text-cyan-700">{t('helpdesk.currentAssignee', 'текущий')}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {t('helpdesk.targetDepartment', 'Отдел-получатель')}
              </label>
              <ComboboxSelect
                value={selectedDepartmentId ? String(selectedDepartmentId) : ''}
                onChange={(nextValue) => setSelectedDepartmentId(nextValue ? Number(nextValue) : '')}
                options={transferDepartmentOptions}
                placeholder={t('helpdesk.selectDepartment', 'Выберите отдел')}
                emptyText={t('helpdesk.noDepartmentsFound', 'Отделы не найдены')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {t('helpdesk.transferReason', 'Причина передачи')}
              </label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                placeholder={t('helpdesk.transferReasonPlaceholder', 'Кратко объясните, почему заявка относится к другому отделу')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-cyan-500 resize-none"
              />
            </div>
          </div>
        )}

        <div className="p-4 border-t border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            type="button"
            disabled={isAssigning || !canApply}
            onClick={handleApply}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          >
            {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'users'
              ? t('helpdesk.applyAssignees', 'Применить')
              : t('helpdesk.transferToDepartment', 'Передать')}
          </button>
        </div>
      </div>
    </div>
  );
}
