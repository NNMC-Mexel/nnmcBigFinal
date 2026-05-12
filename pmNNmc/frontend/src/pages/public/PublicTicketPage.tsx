import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Headphones,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Paperclip,
  X,
} from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import type { ServiceGroup } from '../../types';
import LanguageSwitcher from '../../components/ui/LanguageSwitcher';
import { useAuthStore } from '../../store/authStore';

function formatKazakhstanPhoneInput(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  const local = digits.slice(1);
  const p1 = local.slice(0, 3);
  const p2 = local.slice(3, 6);
  const p3 = local.slice(6, 8);
  const p4 = local.slice(8, 10);

  let result = '+7';
  if (p1) result += ` (${p1}`;
  if (p1.length === 3) result += ')';
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;
  return result;
}

function normalizeKazakhstanPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  return null;
}

const ATTACHMENT_ACCEPT = 'image/*,video/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.avi,.mkv,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
const MAX_ATTACHMENT_SIZE = 250 * 1024 * 1024;

function formatFileSize(size: number) {
  if (!size) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function PublicTicketPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'kz' ? 'kz' : 'ru';
  const currentUser = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');

  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    requesterName: '',
    requesterPhone: '',
    requesterDepartment: '',
    comment: '',
  });

  const profileName =
    `${currentUser?.lastName || ''} ${currentUser?.firstName || ''}`.trim() ||
    currentUser?.username ||
    currentUser?.email ||
    '';
  const profileDepartment =
    currentUser?.department?.name_ru ||
    currentUser?.department?.name_kz ||
    currentUser?.department?.key ||
    '';

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await ticketsApi.getCategories();
        setServiceGroups(data);
      } catch {
        setError(t('helpdesk.loadError', 'Не удалось загрузить категории'));
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setForm((prev) => ({
      ...prev,
      requesterName: profileName,
      requesterDepartment: profileDepartment,
    }));
  }, [currentUser, profileName, profileDepartment]);

  const selectedGroup = serviceGroups.find((sg) => sg.id === selectedGroupId);
  const selectedCategory = selectedGroup?.categories?.find((c) => c.id === selectedCategoryId);
  const normalizedPhone = normalizeKazakhstanPhone(form.requesterPhone);
  const phoneError = form.requesterPhone.trim() && !normalizedPhone;

  const canSubmit = Boolean(
    profileName.trim() &&
    profileDepartment.trim() &&
    normalizedPhone &&
    form.comment.trim() &&
    selectedGroupId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedGroupId || !normalizedPhone) return;
    if (!selectedCategoryId) {
      setError('Вы не выбрали категорию заявки');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await ticketsApi.submitWithFiles({
        requesterPhone: normalizedPhone,
        comment: form.comment.trim(),
        serviceGroupId: selectedGroupId,
        categoryId: selectedCategoryId || undefined,
      }, attachmentFiles);
      setTicketNumber(result.ticketNumber);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || t('helpdesk.submitError', 'Не удалось отправить заявку'));
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
    setAttachmentFiles([]);
    setForm({
      requesterName: profileName,
      requesterPhone: '',
      requesterDepartment: profileDepartment,
      comment: '',
    });
    setError(null);
  };

  const handleAttachmentChange = (files: FileList | File[] | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const oversized = selectedFiles.filter((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized.length > 0) {
      setError(`Файл больше 250 МБ: ${oversized.map((file) => file.name).join(', ')}`);
    } else {
      setError(null);
    }

    const validFiles = selectedFiles.filter((file) => file.size <= MAX_ATTACHMENT_SIZE);
    if (validFiles.length === 0) return;

    setAttachmentFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const next = validFiles.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
      return [...prev, ...next];
    });
  };

  const handleAttachmentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleAttachmentChange(e.target.files);
    e.target.value = '';
  };

  const handleAttachmentDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    handleAttachmentChange(e.dataTransfer.files);
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
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
                onChange={(e) => setForm({ ...form, requesterPhone: formatKazakhstanPhoneInput(e.target.value) })}
                placeholder="+7 (7__) ___-__-__"
                required
                inputMode="tel"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
                  phoneError ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              />
              {phoneError ? (
                <p className="mt-1 text-xs text-red-600">Введите казахстанский номер в формате +7 (7XX) XXX-XX-XX</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Формат: +7 (7XX) XXX-XX-XX</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.requesterName', 'ФИО')} *
              </label>
              <input
                type="text"
                value={profileName || 'ФИО не указано'}
                readOnly
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                placeholder={t('helpdesk.namePlaceholder', 'Иванов Иван Иванович')}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 cursor-default"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('helpdesk.requesterDepartment', 'Отдел')} *
              </label>
              <input
                type="text"
                value={profileDepartment || 'Отдел не указан'}
                readOnly
                onChange={(e) => setForm({ ...form, requesterDepartment: e.target.value })}
                placeholder={t('helpdesk.departmentPlaceholder', 'АКЦ')}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 cursor-default"
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Фото, видео или файл
              </label>
              <input
                ref={fileInputRef}
                id="helpdesk-attachments"
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                onChange={handleAttachmentInputChange}
              />
              <label
                htmlFor="helpdesk-attachments"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={() => setIsDraggingFiles(false)}
                onDrop={handleAttachmentDrop}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                tabIndex={0}
                className={`flex min-h-[58px] items-center justify-center gap-3 w-full px-4 py-3 border border-dashed rounded-xl cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  isDraggingFiles
                    ? 'border-cyan-500 bg-cyan-100 text-cyan-800'
                    : 'border-cyan-300 bg-cyan-50/60 text-cyan-700 hover:bg-cyan-50'
                }`}
              >
                <Paperclip className="w-5 h-5" />
                <span className="flex flex-col text-center leading-tight">
                  <span className="font-medium">Добавить фото, видео или файл</span>
                  <span className="text-xs text-cyan-600">PDF, фото, видео, Word, Excel до 250 МБ</span>
                </span>
              </label>
              {attachmentFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {attachmentFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{file.name}</span>
                        <span className="block text-xs text-slate-400">{formatFileSize(file.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                        aria-label="Удалить вложение"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
