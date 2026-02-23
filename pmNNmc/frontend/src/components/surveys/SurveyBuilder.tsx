import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  GripVertical,
  Settings,
  Eye,
  Save,
  X,
  Copy,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { SurveyQuestion, createSurvey, updateSurvey, ProjectSurvey } from '../../api/surveys';

interface Props {
  projectDocumentId: string;
  projectTitle: string;
  existingSurvey?: ProjectSurvey;
  onClose: () => void;
  onSuccess: () => void;
}

const QUESTION_TYPES = [
  { value: 'text', label: 'Текстовый ответ', icon: '📝' },
  { value: 'single_choice', label: 'Один вариант', icon: '⭕' },
  { value: 'multiple_choice', label: 'Несколько вариантов', icon: '☑️' },
  { value: 'rating', label: 'Оценка (1-5)', icon: '⭐' },
  { value: 'yes_no', label: 'Да / Нет', icon: '✅' },
];

export default function SurveyBuilder({
  projectDocumentId,
  projectTitle,
  existingSurvey,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(existingSurvey?.title || `Анкета: ${projectTitle}`);
  const [description, setDescription] = useState(existingSurvey?.description || '');
  const [isAnonymous, setIsAnonymous] = useState(existingSurvey?.isAnonymous || false);
  const [allowMultipleResponses, setAllowMultipleResponses] = useState(
    existingSurvey?.allowMultipleResponses || false
  );
  const [showProgressBar, setShowProgressBar] = useState(
    existingSurvey?.showProgressBar ?? true
  );
  const [thankYouMessage, setThankYouMessage] = useState(
    existingSurvey?.thankYouMessage || 'Спасибо за участие в опросе!'
  );
  const [expiresAt, setExpiresAt] = useState(existingSurvey?.expiresAt?.split('T')[0] || '');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    existingSurvey?.questions || []
  );
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const addQuestion = () => {
    const newQuestion: SurveyQuestion = {
      text: '',
      type: 'text',
      isRequired: true,
      order: questions.length,
      options: [],
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (index: number, updates: Partial<SurveyQuestion>) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], ...updates };
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === questions.length - 1)
    ) {
      return;
    }
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...questions];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((q, i) => (q.order = i));
    setQuestions(updated);
  };

  const duplicateQuestion = (index: number) => {
    const question = { ...questions[index], order: questions.length };
    setQuestions([...questions, question]);
  };

  const addOption = (questionIndex: number) => {
    const question = questions[questionIndex];
    const options = [...(question.options || []), ''];
    updateQuestion(questionIndex, { options });
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const question = questions[questionIndex];
    const options = [...(question.options || [])];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    const options = (question.options || []).filter((_, i) => i !== optionIndex);
    updateQuestion(questionIndex, { options });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert(t('survey.titleRequired', 'Введите название анкеты'));
      return;
    }
    if (questions.length === 0) {
      alert(t('survey.questionsRequired', 'Добавьте хотя бы один вопрос'));
      return;
    }
    const emptyQuestion = questions.find((q) => !q.text.trim());
    if (emptyQuestion) {
      alert(t('survey.emptyQuestion', 'Заполните текст всех вопросов'));
      return;
    }

    setSaving(true);
    try {
      // Format questions for Strapi component (no __component needed in v5)
      const formattedQuestions = questions.map((q, i) => ({
        text: q.text,
        type: q.type,
        options: q.options || [],
        isRequired: q.isRequired,
        order: i,
      }));

      const data = {
        title,
        description,
        project: projectDocumentId,
        isAnonymous,
        questions: formattedQuestions,
        thankYouMessage,
        allowMultipleResponses,
        showProgressBar,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };

      if (existingSurvey) {
        await updateSurvey(existingSurvey.documentId, data);
      } else {
        await createSurvey(data);
      }
      onSuccess();
    } catch (err) {
      console.error('Failed to save survey', err);
      alert(t('survey.saveFailed', 'Не удалось сохранить анкету'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={existingSurvey ? t('survey.edit', 'Редактировать анкету') : t('survey.create', 'Создать анкету')}
      size="xl"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6 space-y-4">
          <Input
            label={t('survey.titleLabel', 'Название анкеты')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('survey.titlePlaceholder', 'Введите название')}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('survey.description', 'Описание (необязательно)')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('survey.descriptionPlaceholder', 'Краткое описание цели анкеты')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              rows={2}
            />
          </div>
        </div>

        {/* Settings Toggle */}
        <div className="mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-cyan-600"
          >
            <Settings className="w-4 h-4" />
            {t('survey.settings', 'Настройки анкеты')}
            {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showSettings && (
            <div className="mt-3 p-4 bg-slate-50 rounded-lg space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 text-cyan-600 rounded"
                />
                <span className="text-sm text-slate-700">
                  {t('survey.anonymous', 'Анонимная анкета')}
                  <span className="block text-xs text-slate-500">
                    {t('survey.anonymousHint', 'Респонденты не будут указывать ФИО и должность')}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowMultipleResponses}
                  onChange={(e) => setAllowMultipleResponses(e.target.checked)}
                  className="w-4 h-4 text-cyan-600 rounded"
                />
                <span className="text-sm text-slate-700">
                  {t('survey.allowMultiple', 'Разрешить повторные ответы')}
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProgressBar}
                  onChange={(e) => setShowProgressBar(e.target.checked)}
                  className="w-4 h-4 text-cyan-600 rounded"
                />
                <span className="text-sm text-slate-700">
                  {t('survey.showProgress', 'Показывать прогресс заполнения')}
                </span>
              </label>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('survey.expiresAt', 'Дата окончания (необязательно)')}
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('survey.thankYou', 'Сообщение после отправки')}
                </label>
                <input
                  type="text"
                  value={thankYouMessage}
                  onChange={(e) => setThankYouMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Non-anonymous fields hint */}
        {!isAnonymous && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              ℹ️ {t('survey.nonAnonymousHint', 'Перед вопросами анкеты респонденты укажут: ФИО, Должность, Отдел, Email')}
            </p>
          </div>
        )}

        {/* Questions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">
              {t('survey.questions', 'Вопросы')} ({questions.length})
            </h3>
          </div>

          {questions.map((question, qIndex) => (
            <div
              key={qIndex}
              className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-2">
                  <button
                    onClick={() => moveQuestion(qIndex, 'up')}
                    disabled={qIndex === 0}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <GripVertical className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => moveQuestion(qIndex, 'down')}
                    disabled={qIndex === questions.length - 1}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500">#{qIndex + 1}</span>
                    <select
                      value={question.type}
                      onChange={(e) =>
                        updateQuestion(qIndex, {
                          type: e.target.value as SurveyQuestion['type'],
                          options: ['single_choice', 'multiple_choice'].includes(e.target.value)
                            ? question.options?.length ? question.options : ['']
                            : [],
                        })
                      }
                      className="text-sm border border-slate-300 rounded px-2 py-1"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.icon} {t.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-sm text-slate-600 ml-auto">
                      <input
                        type="checkbox"
                        checked={question.isRequired}
                        onChange={(e) => updateQuestion(qIndex, { isRequired: e.target.checked })}
                        className="w-3 h-3"
                      />
                      {t('survey.required', 'Обязательный')}
                    </label>
                  </div>

                  <input
                    type="text"
                    value={question.text}
                    onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
                    placeholder={t('survey.questionPlaceholder', 'Введите вопрос')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />

                  {/* Options for choice questions */}
                  {['single_choice', 'multiple_choice'].includes(question.type) && (
                    <div className="space-y-2 pl-4">
                      {(question.options || []).map((option, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-2">
                          {question.type === 'single_choice' ? (
                            <span className="w-4 h-4 border-2 border-slate-300 rounded-full" />
                          ) : (
                            <span className="w-4 h-4 border-2 border-slate-300 rounded" />
                          )}
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                            placeholder={`${t('survey.option', 'Вариант')} ${oIndex + 1}`}
                            className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm"
                          />
                          <button
                            onClick={() => removeOption(qIndex, oIndex)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addOption(qIndex)}
                        className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        {t('survey.addOption', 'Добавить вариант')}
                      </button>
                    </div>
                  )}

                  {/* Rating preview */}
                  {question.type === 'rating' && (
                    <div className="flex gap-2 pl-4">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className="w-8 h-8 border border-slate-300 rounded flex items-center justify-center text-slate-400"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Yes/No preview */}
                  {question.type === 'yes_no' && (
                    <div className="flex gap-4 pl-4">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="w-4 h-4 border-2 border-slate-300 rounded-full" />
                        {t('survey.yes', 'Да')}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="w-4 h-4 border-2 border-slate-300 rounded-full" />
                        {t('survey.no', 'Нет')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => duplicateQuestion(qIndex)}
                    className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded"
                    title={t('survey.duplicate', 'Дублировать')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeQuestion(qIndex)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title={t('survey.delete', 'Удалить')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addQuestion}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-cyan-500 hover:text-cyan-600 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('survey.addQuestion', 'Добавить вопрос')}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel', 'Отмена')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('common.saving', 'Сохранение...') : t('common.save', 'Сохранить')}
        </Button>
      </div>
    </Modal>
  );
}
