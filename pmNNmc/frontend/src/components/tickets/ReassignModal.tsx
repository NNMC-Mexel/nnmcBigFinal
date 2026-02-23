import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, UserCheck, Loader2 } from 'lucide-react';
import type { AssignableUser } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (userIds: number[]) => Promise<void>;
  users: AssignableUser[];
  currentAssigneeIds?: number[];
}

export default function ReassignModal({ isOpen, onClose, onAssign, users, currentAssigneeIds = [] }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>(currentAssigneeIds);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds(currentAssigneeIds);
    }
  }, [isOpen, currentAssigneeIds]);

  if (!isOpen) return null;

  const filtered = users.filter((u) => {
    const term = search.toLowerCase();
    const fullName = `${u.firstName || ''} ${u.lastName || ''} ${u.username}`.toLowerCase();
    return fullName.includes(term);
  });

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">
            {t('helpdesk.reassign', 'Переназначить')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('helpdesk.searchUser', 'Поиск по имени...')}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-500 py-8 text-sm">
              {t('helpdesk.noUsers', 'Пользователи не найдены')}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((user) => {
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
                        <p className="text-xs text-slate-500">{user.department.name_ru}</p>
                      )}
                    </div>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded border border-cyan-600 bg-cyan-600 text-white flex items-center justify-center flex-shrink-0 text-xs">
                        ✓
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded border border-slate-300 bg-white flex-shrink-0" />
                    )}
                    {isCurrent && !isSelected && <UserCheck className="w-4 h-4 text-cyan-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
            disabled={isAssigning}
            onClick={async () => {
              setIsAssigning(true);
              try {
                await onAssign(selectedUserIds);
                onClose();
              } catch (error) {
                console.error('Failed to assign:', error);
              } finally {
                setIsAssigning(false);
              }
            }}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          >
            {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('helpdesk.applyAssignees', 'Применить')}
          </button>
        </div>
      </div>
    </div>
  );
}
