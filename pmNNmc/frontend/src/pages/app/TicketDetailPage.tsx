import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  UserPlus,
  Phone,
  Building,
  MessageSquare,
  Tag,
  Clock,
  Loader2,
  Paperclip,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useTicketStore } from '../../store/ticketStore';
import { useAuthStore, useUserRole } from '../../store/authStore';
import type { ReassignTicketPayload } from '../../api/tickets';
import type { Ticket } from '../../types';
import TicketStatusBadge from '../../components/tickets/TicketStatusBadge';
import ReassignModal from '../../components/tickets/ReassignModal';
import HouseholdExecutorPanel from '../../components/tickets/HouseholdExecutorPanel';
import Loader from '../../components/ui/Loader';
import { getMediaUrl } from '../../utils/media';
import { subscribeToNotificationRealtime } from '../../api/notificationRealtime';

const STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'INVALID'] as const;
const COMPLEXITIES = ['A', 'B', 'C', 'D'] as const;

const buildTicketDraftSnapshot = (
  documentId: string | undefined,
  status: string,
  complexity: string,
  staffComment: string
) =>
  JSON.stringify({
    documentId,
    status,
    complexity: complexity || '',
    staffComment,
  });

const normalizePermissionText = (value?: string | null) =>
  String(value || '').toLowerCase().replace(/ё/g, 'е').trim();

const hasAnyPermissionToken = (values: Array<string | undefined | null>, tokens: string[]) => {
  const haystack = values.map(normalizePermissionText).filter(Boolean).join(' ');
  return tokens.some((token) => haystack.includes(token));
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';
  const currentUser = useAuthStore((state) => state.user);
  const { isSuperAdmin } = useUserRole();

  const {
    selectedTicket,
    isLoading,
    error,
    assignableUsers,
    fetchTicket,
    updateTicket,
    deleteTicket,
    reassignTicket,
    fetchAssignableUsers,
    clearSelectedTicket,
  } = useTicketStore();

  const [editStatus, setEditStatus] = useState('');
  const [editComplexity, setEditComplexity] = useState('');
  const [editStaffComment, setEditStaffComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const hydratingTicketRef = useRef(false);
  const lastSavedSnapshotRef = useRef('');
  const pendingSaveSnapshotRef = useRef('');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ticket = selectedTicket;
  const assignees = Array.isArray(ticket?.assignee)
    ? ticket.assignee
    : ticket?.assignee
    ? [ticket.assignee]
    : [];
  const isAssignedToMe = assignees.some((a) => Number(a.id) === Number(currentUser?.id));
  const isInMyDepartmentQueue = Boolean(
    ticket &&
      (Number(ticket.targetDepartment?.id) === Number(currentUser?.department?.id) ||
        (!ticket.targetDepartment &&
          Number(ticket.serviceGroup?.department?.id) === Number(currentUser?.department?.id)))
  );
  const isKuat =
    currentUser?.username?.toLowerCase() === 'kuat' ||
    currentUser?.email?.toLowerCase() === 'kuat@nnmc.kz';
  const isDepartmentHead = hasAnyPermissionToken(
    [currentUser?.position, currentUser?.role?.name, currentUser?.role?.type, currentUser?.role?.description],
    ['руковод', 'началь', 'завед', 'директор', 'глав', 'head', 'chief', 'lead', 'басшы']
  );
  const isHelpdeskAdmin = Boolean(
    currentUser?.canManageTickets === true ||
      hasAnyPermissionToken(
        [currentUser?.role?.name, currentUser?.role?.type, currentUser?.role?.description],
        ['superadmin', 'super admin', 'admin', 'админ']
      )
  );
  const ticketDepartmentKey = ticket?.targetDepartment?.key || ticket?.serviceGroup?.department?.key;
  const isEngineeringTicket = ticketDepartmentKey === 'ENGINEERING';
  const canManageDepartmentTicket = Boolean(
    ticket &&
      (isSuperAdmin ||
        isKuat ||
        (isInMyDepartmentQueue && (isDepartmentHead || isHelpdeskAdmin)))
  );
  const canTransferDepartments = Boolean(isSuperAdmin || isKuat || isDepartmentHead || isHelpdeskAdmin);
  const canEditTicket = Boolean(
    ticket &&
      (canManageDepartmentTicket ||
        (!isEngineeringTicket && isAssignedToMe))
  );
  const canReassignTicket = Boolean(ticket && (isSuperAdmin || isKuat || isAssignedToMe || isInMyDepartmentQueue));
  const hasChanges = Boolean(
    ticket &&
      (editStatus !== ticket.status ||
        (editComplexity || '') !== (ticket.complexity || '') ||
        editStaffComment !== (ticket.staffComment || ''))
  );

  useEffect(() => {
    if (id) {
      fetchTicket(id);
      fetchAssignableUsers();
    }
    return () => clearSelectedTicket();
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    return subscribeToNotificationRealtime((payload) => {
      if (!payload.type?.startsWith('tickets:')) return;
      if (payload.ticketDocumentId && payload.ticketDocumentId !== id) return;
      fetchTicket(id);
    });
  }, [id, fetchTicket]);

  useEffect(() => {
    if (selectedTicket) {
      hydratingTicketRef.current = true;
      setEditStatus(selectedTicket.status);
      setEditComplexity(selectedTicket.complexity || '');
      setEditStaffComment(selectedTicket.staffComment || '');
      lastSavedSnapshotRef.current = buildTicketDraftSnapshot(
        selectedTicket.documentId,
        selectedTicket.status,
        selectedTicket.complexity || '',
        selectedTicket.staffComment || ''
      );
    }
  }, [selectedTicket]);

  const persistTicketChanges = useCallback(
    async (
      overrides: Partial<{
        status: string;
        complexity: string;
        staffComment: string;
      }> = {}
    ) => {
      if (!selectedTicket || !canEditTicket) return;

      const nextStatus = overrides.status ?? editStatus;
      const nextComplexity = overrides.complexity ?? editComplexity;
      const nextStaffComment = overrides.staffComment ?? editStaffComment;
      const snapshot = buildTicketDraftSnapshot(
        selectedTicket.documentId,
        nextStatus,
        nextComplexity,
        nextStaffComment
      );

      if (
        snapshot === lastSavedSnapshotRef.current ||
        snapshot === pendingSaveSnapshotRef.current
      ) {
        return;
      }

      pendingSaveSnapshotRef.current = snapshot;
      setSaving(true);
      try {
        await updateTicket(selectedTicket.documentId, {
          status: nextStatus as any,
          complexity: nextComplexity || null,
          staffComment: nextStaffComment || null,
        } as any);
        lastSavedSnapshotRef.current = snapshot;
      } finally {
        if (pendingSaveSnapshotRef.current === snapshot) {
          pendingSaveSnapshotRef.current = '';
        }
        setSaving(false);
      }
    },
    [canEditTicket, editComplexity, editStaffComment, editStatus, selectedTicket, updateTicket]
  );

  useEffect(() => {
    if (hydratingTicketRef.current) {
      hydratingTicketRef.current = false;
      return undefined;
    }
    if (!selectedTicket || !canEditTicket || !hasChanges) return undefined;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persistTicketChanges();
    }, 700);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [canEditTicket, hasChanges, persistTicketChanges, selectedTicket]);

  const handleStatusChange = (status: string) => {
    setEditStatus(status);
    void persistTicketChanges({ status });
  };

  const handleDeleteTicket = async () => {
    if (!selectedTicket || !isSuperAdmin) return;
    const confirmed = window.confirm(`Удалить заявку ${selectedTicket.ticketNumber}?`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteTicket(selectedTicket.documentId);
      navigate('/app/helpdesk');
    } finally {
      setDeleting(false);
    }
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

  if (isLoading && !selectedTicket) return <Loader />;

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => navigate('/app/helpdesk')}
          className="text-cyan-600 hover:underline"
        >
          {t('common.back', 'Назад')}
        </button>
      </div>
    );
  }

  if (!ticket) return null;

  const getCategoryName = () => {
    if (!ticket.category) return '-';
    return lang === 'kz' ? ticket.category.name_kz : ticket.category.name_ru;
  };
  const getServiceGroupName = () => {
    if (!ticket.serviceGroup) return '-';
    return lang === 'kz' ? ticket.serviceGroup.name_kz : ticket.serviceGroup.name_ru;
  };
  const getAssigneeName = (assignee: any) =>
    assignee.firstName || assignee.lastName
      ? `${assignee.lastName || ''} ${assignee.firstName || ''}`.trim()
      : assignee.username;
  const getUserName = (user: any) =>
    user?.firstName || user?.lastName
      ? `${user.lastName || ''} ${user.firstName || ''}`.trim()
      : user?.username || user?.email || '-';

  const canViewUpdatedTicket = (updatedTicket: Ticket) => {
    const updatedAssignees = Array.isArray(updatedTicket.assignee) ? updatedTicket.assignee : [];
    const userId = Number(currentUser?.id);
    const assignedToMe = updatedAssignees.some((assignee) => Number(assignee.id) === userId);
    const requestedByMe = Number(updatedTicket.requester?.id) === userId;
    const updatedDepartmentId =
      updatedTicket.targetDepartment?.id || updatedTicket.serviceGroup?.department?.id;
    const inMyDepartment = Boolean(
      updatedDepartmentId && Number(updatedDepartmentId) === Number(currentUser?.department?.id)
    );

    if (isSuperAdmin || isKuat || assignedToMe || requestedByMe) return true;
    return inMyDepartment && (isDepartmentHead || isHelpdeskAdmin);
  };

  const handleReassign = async (payload: ReassignTicketPayload): Promise<void> => {
    if (!selectedTicket) {
      throw new Error('No ticket selected');
    }

    const updatedTicket = await reassignTicket(selectedTicket.documentId, payload);
    if (canViewUpdatedTicket(updatedTicket)) {
      return;
    }

    navigate('/app/helpdesk');
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-shrink-0 p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 break-words text-2xl font-bold text-cyan-600 font-mono">
                {ticket.ticketNumber}
              </h1>
              <TicketStatusBadge status={ticket.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {formatDate(ticket.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {saving && (
            <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500 sm:w-auto">
              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              Сохраняется...
            </div>
          )}
          {canReassignTicket && !isEngineeringTicket && (
            <button
              onClick={() => setShowReassign(true)}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors sm:w-auto"
            >
              <UserPlus className="w-4 h-4 flex-shrink-0" />
              {t('helpdesk.reassign', 'Переназначить')}
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={handleDeleteTicket}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {deleting ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" /> : <Trash2 className="w-4 h-4 flex-shrink-0" />}
              Удалить
            </button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        {/* Main Content */}
        <div className="min-w-0 space-y-5 lg:col-span-2 lg:space-y-6">
          {/* Requester Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {t('helpdesk.requesterInfo', 'Информация о заявителе')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterName', 'ФИО')}</p>
                  <p className="break-words text-sm font-medium text-slate-800">{ticket.requesterName}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterPhone', 'Телефон')}</p>
                  <p className="break-words text-sm font-medium text-slate-800">{ticket.requesterPhone || '-'}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterDepartment', 'Отдел')}</p>
                  <p className="break-words text-sm font-medium text-slate-800">{ticket.requesterDepartment}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{t('helpdesk.category', 'Категория')}</p>
                  <p className="break-words text-sm font-medium text-slate-800">{getCategoryName()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comment from requester */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              {t('helpdesk.comment', 'Описание проблемы')}
            </h2>
            <div className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              {ticket.comment}
            </div>
          </div>

          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">
                Вложения
              </h2>
              <div className="space-y-2">
                {ticket.attachments.map((file) => (
                  <a
                    key={file.id}
                    href={getMediaUrl(file.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                  >
                    <Paperclip className="w-4 h-4 flex-shrink-0 text-cyan-600" />
                    <span className="truncate">{file.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Staff Comment */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              {t('helpdesk.staffComment', 'Комментарий специалиста')}
            </h2>
            {canEditTicket ? (
              <textarea
                value={editStaffComment}
                onChange={(e) => setEditStaffComment(e.target.value)}
                placeholder={t('helpdesk.staffCommentPlaceholder', 'Добавьте комментарий...')}
                rows={4}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              />
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap break-words">
                {ticket.staffComment || 'Комментарий пока не добавлен'}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="min-w-0 space-y-5 lg:space-y-6">
          {/* Status */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.status', 'Статус')}
            </h3>
            {canEditTicket ? (
              <div className="flex flex-col gap-2">
                {STATUSES.filter((s) => s !== 'DONE').map((s) => (
                  <label
                    key={s}
                    className={`order-2 flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors sm:order-1 ${
                      editStatus === s ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={editStatus === s}
                      onChange={() => handleStatusChange(s)}
                      className="w-4 h-4 text-cyan-600 border-slate-300 focus:outline-none focus:ring-0 focus-visible:ring-0"
                    />
                    <TicketStatusBadge status={s} />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => handleStatusChange('DONE')}
                  className={`order-1 w-full rounded-xl px-4 py-4 text-base font-semibold transition-colors flex items-center justify-center gap-2 sm:order-2 sm:mt-3 ${
                    editStatus === 'DONE'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Выполнено
                </button>
              </div>
            ) : (
              <TicketStatusBadge status={ticket.status} />
            )}
          </div>

          {/* Complexity */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.complexity', 'Сложность')}
            </h3>
            <div className="flex gap-2">
              {COMPLEXITIES.map((c) => (
                <button
                  key={c}
                  disabled={!canEditTicket}
                  onClick={() => canEditTicket && setEditComplexity(editComplexity === c ? '' : c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    editComplexity === c
                      ? 'bg-cyan-600 text-white'
                      : canEditTicket
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {isEngineeringTicket ? (
            <HouseholdExecutorPanel
              ticket={ticket}
              canManage={canEditTicket}
              onTicketUpdated={() => id && fetchTicket(id)}
            />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                {t('helpdesk.assignee', 'Исполнитель')}
              </h3>
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-sm font-medium text-slate-600">
                  {assignees.length > 0
                    ? assignees.length > 1
                      ? assignees.length
                      : (assignees[0].firstName?.[0] || assignees[0].username[0]).toUpperCase()
                    : '?'}
                </div>
                <div className="min-w-0">
                  {assignees.length === 0 ? (
                    <p className="text-sm font-medium text-slate-800">
                      {t('helpdesk.notAssigned', 'Не назначен')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignees.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                        >
                          <span className="truncate">{getAssigneeName(a)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {canReassignTicket && (
                <button
                  onClick={() => setShowReassign(true)}
                  className="mt-3 w-full py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {t('helpdesk.changeAssignee', 'Сменить исполнителя')}
                </button>
              )}
            </div>
          )}

          {/* Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.info', 'Информация')}
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex min-w-0 items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{t('helpdesk.createdAt', 'Создана')}: {formatDate(ticket.createdAt)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-slate-600">
                <Tag className="w-4 h-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{t('helpdesk.serviceGroup', 'Служба')}: {getServiceGroupName()}</span>
              </div>
              {ticket.targetDepartment && (
                <div className="flex min-w-0 items-center gap-2 text-slate-600">
                  <Building className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0 break-words">
                    {t('helpdesk.targetDepartment', 'Отдел-получатель')}:{' '}
                    {lang === 'kz' ? ticket.targetDepartment.name_kz : ticket.targetDepartment.name_ru}
                  </span>
                </div>
              )}
              {ticket.transferReason && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 break-words">
                  {t('helpdesk.transferReason', 'Причина передачи')}: {ticket.transferReason}
                </div>
              )}
              {ticket.completedAt && (
                <div className="flex min-w-0 items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0 break-words">Выполнено: {formatDate(ticket.completedAt)}</span>
                </div>
              )}
              {ticket.completedBy && (
                <div className="flex min-w-0 items-center gap-2 text-slate-600">
                  <UserPlus className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0 break-words">Закрыл: {getUserName(ticket.completedBy)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reassign Modal */}
      <ReassignModal
        isOpen={showReassign}
        onClose={() => setShowReassign(false)}
        onAssign={handleReassign}
        users={assignableUsers}
        currentAssigneeIds={assignees.map((a) => a.id)}
        currentDepartmentId={currentUser?.department?.id}
        currentTargetDepartmentId={ticket.targetDepartment?.id || ticket.serviceGroup?.department?.id}
        canTransferDepartments={canTransferDepartments}
        useTicketDepartmentUsers={isSuperAdmin}
      />
    </div>
  );
}
