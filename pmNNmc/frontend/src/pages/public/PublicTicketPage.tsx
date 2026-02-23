import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Headphones,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { publicTicketsApi } from '../../api/tickets';
import type { ServiceGroup, TicketCategory } from '../../types';
import LanguageSwitcher from '../../components/ui/LanguageSwitcher';

export default function PublicTicketPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');

  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  const [form, setForm] = useState({
    requesterName: '',
    requesterPhone: '',
    requesterDepartment: '',
    comment: '',
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await publicTicketsApi.getCategories();
        setServiceGroups(data);
      } catch {
        setError(t('helpdesk.loadError', 'Не удалось загрузить категории'));
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const selectedGroup = serviceGroups.find((sg) => sg.id === selectedGroupId);
  const selectedCategory = selectedGroup?.categories?.find((c) => c.id === selectedCategoryId);

  const canSubmit =
    form.requesterName.trim() &&
    form.requesterDepartment.trim() &&
    form.comment.trim() &&
    selectedGroupId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedGroupId) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await publicTicketsApi.submit({
        requesterName: form.requesterName.trim(),
        requesterPhone: form.requesterPhone.trim() || undefined,
        requesterDepartment: form.requesterDepartment.trim(),
        comment: form.comment.trim(),
        serviceGroupId: selectedGroupId,
        categoryId: selectedCategoryId || undefined,
      });
      setTicketNumber(result.ticketNumber);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('helpdesk.submitError', 'Не удалось отправить заявку'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setTicketNumber('');
    setSelectedGroupId(null);
    setSelectedCategoryId(null);
    setExpandedGroup(null);
    setForm({ requesterName: '', requesterPhone: '', requesterDepartment: '', comment: '' });
    setError(null);
  };

  const getName = (item: { name_ru: string; name_kz: string }) =>
    lang === 'kz' ? item.name_kz : item.name_ru;

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

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-slate-800 mb-2">
            {t('helpdesk.submitSuccess', 'Заявка успешно подана!')}
          </h1>
          <p className="text-slate-600 mb-2">
            {t('helpdesk.yourTicketNumber', 'Номер вашей заявки')}:
          </p>
          <p className="text-3xl font-bold text-cyan-600 mb-6">{ticketNumber}</p>
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-colors"
          >
            {t('helpdesk.submitAnother', 'Подать еще одну заявку')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Headphones className="w-8 h-8 text-cyan-600" />
            <div>
              <h1 className="font-semibold text-slate-800">
                {t('helpdesk.publicTitle', 'Подать заявку')}
              </h1>
              <p className="text-xs text-slate-500">
                {t('helpdesk.publicSubtitle', 'Заполните форму для подачи заявки в техническую службу')}
              </p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Form */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Service & Category Selection */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {t('helpdesk.selectService', 'Выберите службу')} / {t('helpdesk.selectCategory', 'Категорию')}
            </h2>

            <div className="space-y-2">
              {serviceGroups.map((group) => (
                <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Group Header */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedGroup(expandedGroup === group.id ? null : group.id);
                      setSelectedGroupId(group.id);
                      setSelectedCategoryId(null);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left font-medium transition-colors ${
                      selectedGroupId === group.id
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{getName(group)}</span>
                    <ChevronDown
                      className={`w-5 h-5 transition-transform ${
                        expandedGroup === group.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Categories */}
                  {expandedGroup === group.id && group.categories && group.categories.length > 0 && (
                    <div className="border-t border-slate-200 p-2 space-y-1 max-h-64 overflow-y-auto">
                      {group.categories.map((cat) => (
                        <label
                          key={cat.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            selectedCategoryId === cat.id
                              ? 'bg-cyan-100 text-cyan-800'
                              : 'hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="category"
                            checked={selectedCategoryId === cat.id}
                            onChange={() => setSelectedCategoryId(cat.id)}
                            className="w-4 h-4 text-cyan-600"
                          />
                          <span className="text-sm">{getName(cat)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedGroup && (
              <div className="mt-4 p-3 bg-cyan-50 rounded-lg text-sm text-cyan-800">
                <strong>{t('helpdesk.selectedService', 'Служба')}:</strong> {getName(selectedGroup)}
                {selectedCategory && (
                  <>
                    <br />
                    <strong>{t('helpdesk.selectedCategory', 'Категория')}:</strong> {getName(selectedCategory)}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Contact Info & Description */}
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.requesterPhone', 'Телефон')}
              </label>
              <input
                type="tel"
                value={form.requesterPhone}
                onChange={(e) => setForm({ ...form, requesterPhone: e.target.value })}
                placeholder="777 777 77 77"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.requesterName', 'ФИО')} *
              </label>
              <input
                type="text"
                value={form.requesterName}
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                placeholder={t('helpdesk.namePlaceholder', 'Иванов Иван Иванович')}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.requesterDepartment', 'Отдел')} *
              </label>
              <input
                type="text"
                value={form.requesterDepartment}
                onChange={(e) => setForm({ ...form, requesterDepartment: e.target.value })}
                placeholder={t('helpdesk.departmentPlaceholder', 'АКЦ')}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.comment', 'Описание проблемы')} *
              </label>
              <textarea
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder={t('helpdesk.commentPlaceholder', 'Опишите вашу проблему...')}
                required
                rows={5}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-lg transition-colors ${
                canSubmit && !submitting
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('helpdesk.submitting', 'Отправка...')}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {t('helpdesk.submit', 'Отправить заявку')}
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
