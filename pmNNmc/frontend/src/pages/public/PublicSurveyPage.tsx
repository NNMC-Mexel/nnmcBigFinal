import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  Send,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { getPublicSurvey, submitSurveyResponse, SurveyQuestion } from '../../api/surveys';
import LanguageSwitcher from '../../components/ui/LanguageSwitcher';

interface RespondentInfo {
  name: string;
  position: string;
  department: string;
  email: string;
}

export default function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const startTimeRef = useRef<number>(Date.now());

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState('');

  const [survey, setSurvey] = useState<{
    id: number;
    documentId: string;
    title: string;
    description?: string;
    isAnonymous: boolean;
    questions: SurveyQuestion[];
    showProgressBar: boolean;
    thankYouMessage?: string;
    projectTitle?: string;
  } | null>(null);

  const [currentStep, setCurrentStep] = useState(0); // 0 = respondent info (if not anonymous), 1+ = questions
  const [respondentInfo, setRespondentInfo] = useState<RespondentInfo>({
    name: '',
    position: '',
    department: '',
    email: '',
  });
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchSurvey = async () => {
      if (!token) return;
      try {
        const data = await getPublicSurvey(token);
        setSurvey(data);
        // If anonymous, skip to first question
        if (data.isAnonymous) {
          setCurrentStep(1);
        }
      } catch (err: any) {
        setError(err.response?.data?.error?.message || t('survey.loadError', 'Не удалось загрузить анкету'));
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [token]);

  const totalSteps = survey ? (survey.isAnonymous ? survey.questions.length : survey.questions.length + 1) : 0;
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  const getCurrentQuestion = (): SurveyQuestion | null => {
    if (!survey) return null;
    const questionIndex = survey.isAnonymous ? currentStep - 1 : currentStep - 1;
    return survey.questions[questionIndex] || null;
  };

  const isRespondentInfoValid = () => {
    if (survey?.isAnonymous) return true;
    return respondentInfo.name.trim() !== '';
  };

  const isCurrentQuestionAnswered = () => {
    const question = getCurrentQuestion();
    if (!question) return true;
    if (!question.isRequired) return true;

    const answer = answers[question.id || question.order];
    if (answer === undefined || answer === null || answer === '') return false;
    if (Array.isArray(answer) && answer.length === 0) return false;
    return true;
  };

  const canProceed = () => {
    if (currentStep === 0 && !survey?.isAnonymous) {
      return isRespondentInfoValid();
    }
    return isCurrentQuestionAnswered();
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > (survey?.isAnonymous ? 1 : 0)) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAnswerChange = (questionId: number, value: any) => {
    setAnswers({ ...answers, [questionId]: value });
  };

  const handleSubmit = async () => {
    if (!token || !survey) return;

    setSubmitting(true);
    try {
      const completionTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      
      const result = await submitSurveyResponse(token, {
        answers,
        respondentName: respondentInfo.name,
        respondentPosition: respondentInfo.position,
        respondentDepartment: respondentInfo.department,
        respondentEmail: respondentInfo.email,
        completionTime,
      });

      setThankYouMessage(result.message || survey.thankYouMessage || t('survey.thankYouDefault', 'Спасибо за участие!'));
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('survey.submitError', 'Не удалось отправить ответы'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: SurveyQuestion) => {
    const questionId = question.id || question.order;
    const value = answers[questionId];

    switch (question.type) {
      case 'text':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleAnswerChange(questionId, e.target.value)}
            placeholder={t('survey.enterAnswer', 'Введите ваш ответ...')}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            rows={4}
          />
        );

      case 'single_choice':
        return (
          <div className="space-y-3">
            {question.options?.map((option, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                  value === option
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${questionId}`}
                  value={option}
                  checked={value === option}
                  onChange={() => handleAnswerChange(questionId, option)}
                  className="w-5 h-5 text-cyan-600"
                />
                <span className="text-slate-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'multiple_choice':
        const selectedOptions = value || [];
        return (
          <div className="space-y-3">
            {question.options?.map((option, i) => {
              const isSelected = selectedOptions.includes(option);
              return (
                <label
                  key={i}
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const newValue = isSelected
                        ? selectedOptions.filter((o: string) => o !== option)
                        : [...selectedOptions, option];
                      handleAnswerChange(questionId, newValue);
                    }}
                    className="w-5 h-5 text-cyan-600 rounded"
                  />
                  <span className="text-slate-700">{option}</span>
                </label>
              );
            })}
          </div>
        );

      case 'rating':
        return (
          <div className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => handleAnswerChange(questionId, rating)}
                className={`w-14 h-14 rounded-xl text-xl font-bold transition-all ${
                  value === rating
                    ? 'bg-yellow-400 text-white scale-110 shadow-lg'
                    : 'bg-slate-100 text-slate-600 hover:bg-yellow-100'
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        );

      case 'yes_no':
        return (
          <div className="flex justify-center gap-4">
            <button
              onClick={() => handleAnswerChange(questionId, 'yes')}
              className={`px-8 py-4 rounded-xl text-lg font-medium transition-all ${
                value === 'yes'
                  ? 'bg-green-500 text-white scale-105 shadow-lg'
                  : 'bg-slate-100 text-slate-600 hover:bg-green-100'
              }`}
            >
              {t('survey.yes', 'Да')}
            </button>
            <button
              onClick={() => handleAnswerChange(questionId, 'no')}
              className={`px-8 py-4 rounded-xl text-lg font-medium transition-all ${
                value === 'no'
                  ? 'bg-red-500 text-white scale-105 shadow-lg'
                  : 'bg-slate-100 text-slate-600 hover:bg-red-100'
              }`}
            >
              {t('survey.no', 'Нет')}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">{t('common.loading', 'Загрузка...')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-800 mb-2">{t('survey.error', 'Ошибка')}</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-slate-800 mb-4">{thankYouMessage}</h1>
          <p className="text-slate-600">{t('survey.canClose', 'Теперь вы можете закрыть эту страницу')}</p>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  const currentQuestion = getCurrentQuestion();
  const isLastStep = currentStep === totalSteps;
  const isRespondentStep = currentStep === 0 && !survey.isAnonymous;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-cyan-600" />
            <div>
              <h1 className="font-semibold text-slate-800">{survey.title}</h1>
              {survey.projectTitle && (
                <p className="text-xs text-slate-500">{survey.projectTitle}</p>
              )}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        {/* Progress Bar */}
        {survey.showProgressBar && (
          <div className="h-1 bg-slate-200">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[400px] flex flex-col">
          {/* Respondent Info Step */}
          {isRespondentStep && (
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                {t('survey.aboutYou', 'О вас')}
              </h2>
              <p className="text-slate-600 mb-6">
                {t('survey.fillInfo', 'Пожалуйста, укажите ваши данные')}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('survey.yourName', 'Ваше ФИО')} *
                  </label>
                  <input
                    type="text"
                    value={respondentInfo.name}
                    onChange={(e) => setRespondentInfo({ ...respondentInfo, name: e.target.value })}
                    placeholder={t('survey.namePlaceholder', 'Иванов Иван Иванович')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('survey.yourPosition', 'Ваша должность')}
                  </label>
                  <input
                    type="text"
                    value={respondentInfo.position}
                    onChange={(e) => setRespondentInfo({ ...respondentInfo, position: e.target.value })}
                    placeholder={t('survey.positionPlaceholder', 'Менеджер проектов')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('survey.yourDepartment', 'Ваш отдел')}
                  </label>
                  <input
                    type="text"
                    value={respondentInfo.department}
                    onChange={(e) => setRespondentInfo({ ...respondentInfo, department: e.target.value })}
                    placeholder={t('survey.departmentPlaceholder', 'IT отдел')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Question Step */}
          {!isRespondentStep && currentQuestion && (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 bg-cyan-100 text-cyan-700 rounded-full flex items-center justify-center text-sm font-medium">
                  {survey.isAnonymous ? currentStep : currentStep}
                </span>
                <span className="text-sm text-slate-500">
                  {t('survey.questionOf', 'Вопрос')} {survey.isAnonymous ? currentStep : currentStep} {t('survey.of', 'из')} {survey.questions.length}
                </span>
                {currentQuestion.isRequired && (
                  <span className="text-xs text-red-500 ml-auto">* {t('survey.requiredField', 'Обязательный')}</span>
                )}
              </div>

              <h2 className="text-xl font-semibold text-slate-800 mb-6">
                {currentQuestion.text}
              </h2>

              {renderQuestion(currentQuestion)}
            </div>
          )}

          {/* Review Step (last step) */}
          {isLastStep && !currentQuestion && (
            <div className="flex-1 text-center py-8">
              <CheckCircle className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                {t('survey.allDone', 'Вы ответили на все вопросы!')}
              </h2>
              <p className="text-slate-600">
                {t('survey.clickSubmit', 'Нажмите кнопку "Отправить" чтобы завершить')}
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={handlePrev}
              disabled={currentStep === (survey.isAnonymous ? 1 : 0)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentStep === (survey.isAnonymous ? 1 : 0)
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              {t('survey.back', 'Назад')}
            </button>

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('survey.submitting', 'Отправка...')}
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {t('survey.submit', 'Отправить')}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                  canProceed()
                    ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {t('survey.next', 'Далее')}
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {survey.description && currentStep === (survey.isAnonymous ? 1 : 0) && (
          <div className="mt-6 p-4 bg-white/50 rounded-xl text-sm text-slate-600 text-center">
            {survey.description}
          </div>
        )}
      </main>
    </div>
  );
}
