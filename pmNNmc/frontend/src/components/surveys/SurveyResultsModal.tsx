import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Users,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  PieChart,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getSurveyResults, SurveyResults, SurveyStatistics, SurveyResponse } from '../../api/surveys';

interface Props {
  surveyDocumentId: string;
  onClose: () => void;
}

type ViewMode = 'summary' | 'individual';

export default function SurveyResultsModal({ surveyDocumentId, onClose }: Props) {
  const { t } = useTranslation();
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const data = await getSurveyResults(surveyDocumentId);
        setResults(data);
      } catch (err) {
        console.error('Failed to load results', err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [surveyDocumentId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const exportToCSV = () => {
    if (!results) return;

    const headers = ['Респондент', 'Должность', 'Отдел', 'Email', 'Дата', 'Время заполнения'];
    results.statistics.forEach((stat) => {
      headers.push(stat.questionText);
    });

    const rows = results.individualResponses.map((response) => {
      const row = [
        response.isAnonymous ? 'Анонимно' : response.respondentName || '-',
        response.respondentPosition || '-',
        response.respondentDepartment || '-',
        response.respondentEmail || '-',
        formatDate(response.createdAt),
        formatTime(response.completionTime),
      ];

      results.statistics.forEach((stat) => {
        const answer = response.answers[stat.questionId];
        if (Array.isArray(answer)) {
          row.push(answer.join(', '));
        } else {
          row.push(String(answer || '-'));
        }
      });

      return row;
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `survey-results-${results.survey.title}.csv`;
    link.click();
  };

  const renderStatistic = (stat: SurveyStatistics) => {
    switch (stat.questionType) {
      case 'single_choice':
      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {stat.options?.map((option, i) => {
              const count = stat.optionCounts?.[option] || 0;
              const percent = stat.totalAnswers > 0 ? (count / stat.totalAnswers) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{option}</span>
                      <span className="text-slate-500">
                        {count} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'rating':
        return (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-3xl font-bold text-cyan-600">{stat.average}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`text-xl ${
                      n <= Math.round(Number(stat.average || 0))
                        ? 'text-yellow-400'
                        : 'text-slate-300'
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="text-sm text-slate-500">
                {t('survey.outOf5', 'из 5')}
              </span>
            </div>
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = stat.distribution?.[rating] || 0;
                const percent = stat.totalAnswers > 0 ? (count / stat.totalAnswers) * 100 : 0;
                return (
                  <div key={rating} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-slate-600">{rating}</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'yes_no':
        const yesPercent = Number(stat.yesPercent) || 0;
        const noPercent = 100 - yesPercent;
        return (
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <div className="flex gap-4 mb-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stat.yesCount}</div>
                  <div className="text-sm text-slate-500">{t('survey.yes', 'Да')}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{stat.noCount}</div>
                  <div className="text-sm text-slate-500">{t('survey.no', 'Нет')}</div>
                </div>
              </div>
              <div className="h-4 bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${yesPercent}%` }}
                />
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>{yesPercent.toFixed(0)}%</span>
                <span>{noPercent.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {stat.textAnswers?.length === 0 ? (
              <p className="text-sm text-slate-500 italic">{t('survey.noTextAnswers', 'Нет текстовых ответов')}</p>
            ) : (
              stat.textAnswers?.map((answer, i) => (
                <div key={i} className="p-2 bg-white border border-slate-200 rounded text-sm text-slate-700">
                  {answer}
                </div>
              ))
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderIndividualResponse = (response: SurveyResponse) => {
    const isExpanded = expandedResponse === response.documentId;

    return (
      <div
        key={response.documentId}
        className="border border-slate-200 rounded-lg overflow-hidden"
      >
        <button
          onClick={() => setExpandedResponse(isExpanded ? null : response.documentId)}
          className="w-full p-4 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-slate-800">
                {response.isAnonymous
                  ? t('survey.anonymousRespondent', 'Анонимный респондент')
                  : response.respondentName || t('survey.noName', 'Без имени')}
              </p>
              <p className="text-xs text-slate-500">
                {!response.isAnonymous && response.respondentPosition && (
                  <span>{response.respondentPosition} • </span>
                )}
                {formatDate(response.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {response.completionTime && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(response.completionTime)}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="p-4 space-y-4 border-t border-slate-200">
            {!response.isAnonymous && (
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs text-slate-500">{t('survey.respondentName', 'ФИО')}</span>
                  <p className="text-sm text-slate-800">{response.respondentName || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">{t('survey.respondentPosition', 'Должность')}</span>
                  <p className="text-sm text-slate-800">{response.respondentPosition || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">{t('survey.respondentDepartment', 'Отдел')}</span>
                  <p className="text-sm text-slate-800">{response.respondentDepartment || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">{t('survey.respondentEmail', 'Email')}</span>
                  <p className="text-sm text-slate-800">{response.respondentEmail || '-'}</p>
                </div>
              </div>
            )}

            {results?.statistics.map((stat) => {
              const answer = response.answers[stat.questionId];
              let displayAnswer = '-';

              if (answer !== undefined && answer !== null) {
                if (Array.isArray(answer)) {
                  displayAnswer = answer.join(', ');
                } else if (stat.questionType === 'yes_no') {
                  displayAnswer = answer === 'yes' || answer === true ? t('survey.yes', 'Да') : t('survey.no', 'Нет');
                } else if (stat.questionType === 'rating') {
                  displayAnswer = '★'.repeat(Number(answer)) + '☆'.repeat(5 - Number(answer));
                } else {
                  displayAnswer = String(answer);
                }
              }

              return (
                <div key={stat.questionId}>
                  <p className="text-sm font-medium text-slate-700 mb-1">{stat.questionText}</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">{displayAnswer}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('survey.results', 'Результаты анкеты')} size="xl">
      {loading ? (
        <div className="py-12 text-center text-slate-500">{t('common.loading', 'Загрузка...')}</div>
      ) : !results ? (
        <div className="py-12 text-center text-slate-500">{t('survey.noResults', 'Не удалось загрузить результаты')}</div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Header */}
          <div className="mb-6 pb-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{results.survey.title}</h3>
            {results.survey.description && (
              <p className="text-sm text-slate-600 mb-3">{results.survey.description}</p>
            )}
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {results.totalResponses} {t('survey.responsesCount', 'ответов')}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {results.statistics.length} {t('survey.questionsCount', 'вопросов')}
              </span>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'summary'
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <PieChart className="w-4 h-4" />
              {t('survey.summaryView', 'Сводка')}
            </button>
            <button
              onClick={() => setViewMode('individual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'individual'
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              {t('survey.individualView', 'По респондентам')}
            </button>
            <div className="ml-auto">
              <Button size="sm" variant="secondary" onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-1" />
                {t('survey.exportCSV', 'Экспорт CSV')}
              </Button>
            </div>
          </div>

          {/* Content */}
          {viewMode === 'summary' ? (
            <div className="space-y-6">
              {results.statistics.map((stat, i) => (
                <div key={stat.questionId} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="w-6 h-6 bg-cyan-100 text-cyan-700 rounded-full flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-800">{stat.questionText}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {stat.totalAnswers} {t('survey.answersCount', 'ответов')}
                      </p>
                    </div>
                  </div>
                  {renderStatistic(stat)}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {results.individualResponses.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  {t('survey.noResponses', 'Пока нет ответов')}
                </div>
              ) : (
                results.individualResponses.map(renderIndividualResponse)
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
