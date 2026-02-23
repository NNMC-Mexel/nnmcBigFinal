import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, User, FolderKanban, Clock } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { activityLogApi, ActivityLog } from '../../api/activityLog';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Loader from '../../components/ui/Loader';
import { useUserRole } from '../../store/authStore';

const actionLabels: Record<
  string,
  { labelKey: string; color: 'success' | 'warning' | 'danger' | 'info' | 'default' }
> = {
  CREATE_PROJECT: { labelKey: 'activityLog.actions.createProject', color: 'success' },
  UPDATE_PROJECT: { labelKey: 'activityLog.actions.updateProject', color: 'info' },
  DELETE_PROJECT: { labelKey: 'activityLog.actions.deleteProject', color: 'danger' },
  MOVE_STAGE: { labelKey: 'activityLog.actions.moveStage', color: 'info' },
  CREATE_TASK: { labelKey: 'activityLog.actions.createTask', color: 'success' },
  MARK_TASK: { labelKey: 'activityLog.actions.markTask', color: 'info' },
  DELETE_TASK: { labelKey: 'activityLog.actions.deleteTask', color: 'danger' },
  CREATE_MEETING: { labelKey: 'activityLog.actions.createMeeting', color: 'success' },
  DELETE_MEETING: { labelKey: 'activityLog.actions.deleteMeeting', color: 'danger' },
  CREATE_DOCUMENT: { labelKey: 'activityLog.actions.createDocument', color: 'success' },
  DELETE_DOCUMENT: { labelKey: 'activityLog.actions.deleteDocument', color: 'danger' },
  ASSIGN_USER: { labelKey: 'activityLog.actions.assignUser', color: 'warning' },
  ARCHIVE_PROJECT: { labelKey: 'activityLog.actions.archiveProject', color: 'warning' },
  RESTORE_PROJECT: { labelKey: 'activityLog.actions.restoreProject', color: 'success' },
  UPDATE_TASK: { labelKey: 'activityLog.actions.updateTask', color: 'info' },
  UPDATE_MEETING: { labelKey: 'activityLog.actions.updateMeeting', color: 'info' },
};

export default function ActivityLogPage() {
  const { t, i18n } = useTranslation();
  const { isAdmin } = useUserRole();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const response = await activityLogApi.getAll({ pageSize: 100 });
      setLogs(response.data || []);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserName = (user?: { firstName?: string; lastName?: string; username: string }) => {
    if (!user) return t('activityLog.unknownUser');
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.username;
  };

  const getActionInfo = (action: string) => {
    const info = actionLabels[action];
    return {
      label: info ? t(info.labelKey) : action,
      color: info?.color ?? ('default' as const),
    };
  };

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (isLoading) {
    return <Loader text={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
          <Activity className="w-7 h-7 text-primary-500" />
          {t('activityLog.title')}
        </h1>
        <p className="text-slate-500 mt-1">{t('activityLog.subtitle')}</p>
      </div>

      <Card padding="none">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Activity className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>{t('activityLog.empty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const actionInfo = getActionInfo(log.action);
              return (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-slate-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800">{getUserName(log.user)}</span>
                        <Badge variant={actionInfo.color} size="sm">
                          {actionInfo.label}
                        </Badge>
                      </div>

                      <p className="text-slate-600 mt-1">{log.description}</p>

                      {log.project && (
                        <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                          <FolderKanban className="w-4 h-4" />
                          <span>{log.project.title}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDateTime(log.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
