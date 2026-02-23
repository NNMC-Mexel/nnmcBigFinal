import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Save,
  UserPlus,
  Phone,
  Building,
  MessageSquare,
  Tag,
  Clock,
  Loader2,
} from 'lucide-react';
import { useTicketStore } from '../../store/ticketStore';
import TicketStatusBadge from '../../components/tickets/TicketStatusBadge';
import ReassignModal from '../../components/tickets/ReassignModal';
import Loader from '../../components/ui/Loader';

const STATUSES = ['NEW', 'IN_PROGRESS', 'DONE', 'INVALID'] as const;
const COMPLEXITIES = ['A', 'B', 'C', 'D'] as const;

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';

  const {
    selectedTicket,
    isLoading,
    error,
    assignableUsers,
    fetchTicket,
    updateTicket,
    reassignTicket,
    fetchAssignableUsers,
    clearSelectedTicket,
  } = useTicketStore();

  const [editStatus, setEditStatus] = useState('');
  const [editComplexity, setEditComplexity] = useState('');
  const [editStaffComment, setEditStaffComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  useEffect(() => {
    if (id) {
      fetchTicket(id);
      fetchAssignableUsers();
    }
    return () => clearSelectedTicket();
  }, [id]);

  useEffect(() => {
    if (selectedTicket) {
      setEditStatus(selectedTicket.status);
      setEditComplexity(selectedTicket.complexity || '');
      setEditStaffComment(selectedTicket.staffComment || '');
    }
  }, [selectedTicket]);

  const handleSave = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await updateTicket(selectedTicket.documentId, {
        status: editStatus as any,
        complexity: (editComplexity || undefined) as any,
        staffComment: editStaffComment || undefined,
      });
      // Re-fetch to get updated data
      if (id) await fetchTicket(id);
    } finally {
      setSaving(false);
    }
  };

  const handleReassign = async (userIds: number[]): Promise<void> => {
    if (!selectedTicket) {
      throw new Error('No ticket selected');
    }
    await reassignTicket(selectedTicket.documentId, userIds);
    if (id) await fetchTicket(id);
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

  if (!selectedTicket) return null;

  const ticket = selectedTicket;
  const assignees = Array.isArray(ticket.assignee)
    ? ticket.assignee
    : ticket.assignee
    ? [ticket.assignee]
    : [];
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

  const hasChanges =
    editStatus !== ticket.status ||
    (editComplexity || '') !== (ticket.complexity || '') ||
    editStaffComment !== (ticket.staffComment || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app/helpdesk')}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-cyan-600 font-mono">
                {ticket.ticketNumber}
              </h1>
              <TicketStatusBadge status={ticket.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {formatDate(ticket.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReassign(true)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t('helpdesk.reassign', 'Переназначить')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasChanges && !saving
                ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save', 'Сохранить')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Requester Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {t('helpdesk.requesterInfo', 'Информация о заявителе')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterName', 'ФИО')}</p>
                  <p className="text-sm font-medium text-slate-800">{ticket.requesterName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterPhone', 'Телефон')}</p>
                  <p className="text-sm font-medium text-slate-800">{ticket.requesterPhone || '-'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{t('helpdesk.requesterDepartment', 'Отдел')}</p>
                  <p className="text-sm font-medium text-slate-800">{ticket.requesterDepartment}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{t('helpdesk.category', 'Категория')}</p>
                  <p className="text-sm font-medium text-slate-800">{getCategoryName()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Comment from requester */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              {t('helpdesk.comment', 'Описание проблемы')}
            </h2>
            <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-wrap">
              {ticket.comment}
            </div>
          </div>

          {/* Staff Comment */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              {t('helpdesk.staffComment', 'Комментарий специалиста')}
            </h2>
            <textarea
              value={editStaffComment}
              onChange={(e) => setEditStaffComment(e.target.value)}
              placeholder={t('helpdesk.staffCommentPlaceholder', 'Добавьте комментарий...')}
              rows={4}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.status', 'Статус')}
            </h3>
            <div className="space-y-2">
              {STATUSES.map((s) => (
                <label
                  key={s}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    editStatus === s ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={editStatus === s}
                    onChange={() => setEditStatus(s)}
                    className="w-4 h-4 text-cyan-600 border-slate-300 focus:outline-none focus:ring-0 focus-visible:ring-0"
                  />
                  <TicketStatusBadge status={s} />
                </label>
              ))}
            </div>
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
                  onClick={() => setEditComplexity(editComplexity === c ? '' : c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    editComplexity === c
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.assignee', 'Исполнитель')}
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-sm font-medium text-slate-600">
                {assignees.length > 0
                  ? assignees.length > 1
                    ? assignees.length
                    : (assignees[0].firstName?.[0] || assignees[0].username[0]).toUpperCase()
                  : '?'}
              </div>
              <div>
                {assignees.length === 0 ? (
                  <p className="text-sm font-medium text-slate-800">
                    {t('helpdesk.notAssigned', 'Не назначен')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignees.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {getAssigneeName(a)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowReassign(true)}
              className="mt-3 w-full py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {t('helpdesk.changeAssignee', 'Сменить исполнителя')}
            </button>
          </div>

          {/* Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              {t('helpdesk.info', 'Информация')}
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4" />
                <span>{t('helpdesk.createdAt', 'Создана')}: {formatDate(ticket.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Tag className="w-4 h-4" />
                <span>{t('helpdesk.serviceGroup', 'Служба')}: {getServiceGroupName()}</span>
              </div>
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
      />
    </div>
  );
}
