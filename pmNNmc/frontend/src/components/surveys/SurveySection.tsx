import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  Plus,
  Eye,
  Link2,
  Play,
  Pause,
  Trash2,
  Copy,
  BarChart3,
  Edit,
  ExternalLink,
  Users,
  Clock,
  CheckCircle,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  ProjectSurvey,
  getProjectSurveys,
  deleteSurvey,
  toggleSurveyStatus,
  duplicateSurvey,
} from '../../api/surveys';
import SurveyBuilder from './SurveyBuilder';
import SurveyResultsModal from './SurveyResultsModal';

interface Props {
  projectDocumentId: string;
  projectTitle: string;
  projectProgress: number;
  canEdit: boolean;
}

const DEFAULT_FRONTEND_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://127.0.0.1:13010';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || DEFAULT_FRONTEND_URL;

export default function SurveySection({
  projectDocumentId,
  projectTitle,
  projectProgress,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const [surveys, setSurveys] = useState<ProjectSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<ProjectSurvey | null>(null);
  const [showResults, setShowResults] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const isProjectComplete = projectProgress >= 100;

  const fetchSurveys = async () => {
    try {
      const data = await getProjectSurveys(projectDocumentId);
      setSurveys(data);
    } catch (err) {
      console.error('Failed to load surveys', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [projectDocumentId]);

  const handleDelete = async (surveyId: string) => {
    if (!confirm(t('survey.confirmDelete', 'Удалить анкету? Все ответы будут потеряны.'))) return;
    try {
      await deleteSurvey(surveyId);
      await fetchSurveys();
    } catch (err) {
      console.error('Failed to delete survey', err);
    }
  };

  const handleToggleStatus = async (surveyId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    try {
      await toggleSurveyStatus(surveyId, newStatus);
      await fetchSurveys();
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  const handleDuplicate = async (surveyId: string) => {
    try {
      await duplicateSurvey(surveyId);
      await fetchSurveys();
    } catch (err) {
      console.error('Failed to duplicate survey', err);
    }
  };

  const copyLink = (token: string) => {
    const link = `${FRONTEND_URL}/survey/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(token);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="default">{t('survey.statusDraft', 'Черновик')}</Badge>;
      case 'active':
        return <Badge variant="success">{t('survey.statusActive', 'Активна')}</Badge>;
      case 'closed':
        return <Badge variant="default">{t('survey.statusClosed', 'Закрыта')}</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-cyan-600" />
          {t('survey.title', 'Анкеты')}
        </h3>
        {canEdit && (
          <div className="relative">
            <Button
              size="sm"
              onClick={() => setShowBuilder(true)}
              disabled={!isProjectComplete}
              title={
                !isProjectComplete
                  ? t('survey.completeProjectFirst', 'Завершите проект (100%) чтобы создать анкету')
                  : ''
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('survey.create', 'Создать анкету')}
            </Button>
            {!isProjectComplete && (
              <p className="absolute right-0 top-full mt-1 text-xs text-amber-600 whitespace-nowrap">
                🔒 {t('survey.requiresComplete', 'Требуется 100% выполнения')}
              </p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">{t('common.loading', 'Загрузка...')}</p>
      ) : surveys.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>{t('survey.empty', 'Анкеты ещё не созданы')}</p>
          {!isProjectComplete && (
            <p className="text-sm mt-2 text-amber-600">
              {t('survey.completeToCreate', 'Доведите проект до 100% чтобы создать анкету')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {surveys.map((survey) => (
            <div
              key={survey.documentId}
              className="p-4 bg-slate-50 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-slate-800">{survey.title}</h4>
                    {getStatusBadge(survey.status)}
                    {survey.isAnonymous && (
                      <Badge variant="info">{t('survey.anonymous', 'Анонимная')}</Badge>
                    )}
                  </div>
                  {survey.description && (
                    <p className="text-sm text-slate-600 mb-2">{survey.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(survey.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {survey.responses?.length || 0} {t('survey.responses', 'ответов')}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {survey.questions?.length || 0} {t('survey.questionsCount', 'вопросов')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Results */}
                  <button
                    onClick={() => setShowResults(survey.documentId)}
                    className="p-2 text-cyan-600 hover:bg-cyan-100 rounded-lg transition-colors"
                    title={t('survey.viewResults', 'Посмотреть ответы')}
                  >
                    <BarChart3 className="w-5 h-5" />
                  </button>

                  {/* Copy Link */}
                  {survey.status === 'active' && (
                    <button
                      onClick={() => copyLink(survey.publicToken)}
                      className={`p-2 rounded-lg transition-colors ${
                        copiedLink === survey.publicToken
                          ? 'bg-green-100 text-green-600'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                      title={t('survey.copyLink', 'Скопировать ссылку')}
                    >
                      {copiedLink === survey.publicToken ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Link2 className="w-5 h-5" />
                      )}
                    </button>
                  )}

                  {/* Open in new tab */}
                  {survey.status === 'active' && (
                    <a
                      href={`${FRONTEND_URL}/survey/${survey.publicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                      title={t('survey.openLink', 'Открыть анкету')}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  )}

                  {canEdit && (
                    <>
                      {/* Toggle Status */}
                      <button
                        onClick={() => handleToggleStatus(survey.documentId, survey.status)}
                        className={`p-2 rounded-lg transition-colors ${
                          survey.status === 'active'
                            ? 'text-amber-600 hover:bg-amber-100'
                            : 'text-green-600 hover:bg-green-100'
                        }`}
                        title={
                          survey.status === 'active'
                            ? t('survey.deactivate', 'Остановить сбор')
                            : t('survey.activate', 'Запустить сбор')
                        }
                      >
                        {survey.status === 'active' ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>

                      {/* Edit */}
                      {survey.status === 'draft' && (
                        <button
                          onClick={() => setEditingSurvey(survey)}
                          className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          title={t('survey.edit', 'Редактировать')}
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                      )}

                      {/* Duplicate */}
                      <button
                        onClick={() => handleDuplicate(survey.documentId)}
                        className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        title={t('survey.duplicate', 'Дублировать')}
                      >
                        <Copy className="w-5 h-5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(survey.documentId)}
                        className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                        title={t('survey.delete', 'Удалить')}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Public Link Display */}
              {survey.status === 'active' && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">{t('survey.link', 'Ссылка')}:</span>
                    <code className="px-2 py-1 bg-white rounded border text-xs text-slate-600 flex-1 truncate">
                      {FRONTEND_URL}/survey/{survey.publicToken}
                    </code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Survey Builder Modal */}
      {(showBuilder || editingSurvey) && (
        <SurveyBuilder
          projectDocumentId={projectDocumentId}
          projectTitle={projectTitle}
          existingSurvey={editingSurvey || undefined}
          onClose={() => {
            setShowBuilder(false);
            setEditingSurvey(null);
          }}
          onSuccess={() => {
            setShowBuilder(false);
            setEditingSurvey(null);
            fetchSurveys();
          }}
        />
      )}

      {/* Survey Results Modal */}
      {showResults && (
        <SurveyResultsModal
          surveyDocumentId={showResults}
          onClose={() => setShowResults(null)}
        />
      )}
    </div>
  );
}
