import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import {
  onboardingApi,
  type OnboardingExtraField,
  type OnboardingExtraFieldSection,
  type OnboardingExtraFieldType,
  type OnboardingInvitation,
  type OnboardingSettings,
  type OnboardingStatus,
} from '../../api/onboarding';
import { useUserRole } from '../../store/authStore';

const statusLabels: Record<OnboardingStatus, string> = {
  CREATED: 'Создано',
  OPENED: 'Открыто',
  DRAFT: 'Черновик',
  BLOCKED: 'Заблокировано',
  EXPIRED: 'Истекло',
  SUBMITTED: 'На проверке HR',
  RETURNED: 'На корректировке',
  APPROVED: 'Утверждено HR',
  SENT_ONEC: 'Передано в 1С',
  ONEC_ERROR: 'Ошибка 1С',
};

const statusClass: Record<OnboardingStatus, string> = {
  CREATED: 'bg-blue-100 text-blue-700',
  OPENED: 'bg-cyan-100 text-cyan-700',
  DRAFT: 'bg-slate-100 text-slate-700',
  BLOCKED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
  SUBMITTED: 'bg-violet-100 text-violet-700',
  RETURNED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  SENT_ONEC: 'bg-teal-100 text-teal-700',
  ONEC_ERROR: 'bg-red-100 text-red-700',
};

const correctionSections = [
  { value: 'Личные данные', label: 'Личные данные' },
  { value: 'Документы', label: 'Документы' },
  { value: 'Адреса и контакты', label: 'Адреса и контакты' },
  { value: 'Образование', label: 'Образование' },
  { value: 'Медицинские данные', label: 'Медицинские данные' },
  { value: 'Семья', label: 'Семья' },
  { value: 'Трудовая деятельность', label: 'Трудовая деятельность' },
  { value: 'Реквизиты', label: 'Реквизиты' },
];

const documentRequirementOptions = [
  ['identityPhoto', 'Фото 3x4'],
  ['identityDocument', 'Удостоверяющий документ'],
  ['signature', 'Образец личной подписи'],
  ['form075', 'Медицинская справка 075'],
  ['noCriminalRecord', 'Справка о несудимости'],
  ['narcology', 'Справка из наркологии'],
  ['psychiatry', 'Справка из психиатрии'],
  ['marriageDocument', 'Свидетельство о браке'],
  ['familyMemberDocuments', 'Документы членов семьи'],
  ['educationDocuments', 'Дипломы и сертификаты'],
  ['bankRequisites', 'Банковские реквизиты Halyk Bank'],
] as const;

const extraFieldSections: Array<{ value: OnboardingExtraFieldSection; label: string }> = [
  { value: 'identity', label: 'Личные данные' },
  { value: 'documents', label: 'Документы' },
  { value: 'contacts', label: 'Адреса и контакты' },
  { value: 'education', label: 'Образование' },
  { value: 'medical', label: 'Медицинские данные' },
  { value: 'family', label: 'Семья' },
  { value: 'work', label: 'Трудовая деятельность' },
  { value: 'bank', label: 'Реквизиты' },
];

const extraFieldTypes: Array<{ value: OnboardingExtraFieldType; label: string }> = [
  { value: 'text', label: 'Одна строка' },
  { value: 'textarea', label: 'Многострочный текст' },
  { value: 'date', label: 'Дата' },
  { value: 'select', label: 'Выпадающий список' },
  { value: 'checkbox', label: 'Галочка' },
  { value: 'file', label: 'Файл' },
];

const emptySettings: OnboardingSettings = { documentRequirements: {}, extraFields: [] };

function normalizeIin(value: string) {
  return value.replace(/\D/g, '').slice(0, 12);
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  const source = digits.startsWith('8') ? digits.slice(1) : digits.startsWith('7') ? digits.slice(1) : digits;
  return `+7 ${source.slice(0, 3)} ${source.slice(3, 6)} ${source.slice(6, 8)} ${source.slice(8, 10)}`.trim();
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU');
}

function fullName(draft: Record<string, any>) {
  const identity = draft.identity || {};
  return `${identity.lastName || ''} ${identity.firstName || ''} ${identity.middleName || ''}`.trim() || 'ФИО не заполнено';
}

function SummaryRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-800">{value || '-'}</p>
    </div>
  );
}

function FileLink({ files, empty = '-' }: { files?: Array<{ id?: number; name?: string; url?: string }>; empty?: string }) {
  if (!files?.length) return <>{empty}</>;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {files.map((file, index) => file.url ? (
        <a
          key={`${file.id || file.name}-${index}`}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary-600 underline-offset-2 hover:underline"
        >
          {file.name || `Файл ${index + 1}`}
        </a>
      ) : <span key={`${file.id || file.name}-${index}`}>{file.name || `Файл ${index + 1}`}</span>)}
    </span>
  );
}

export default function NewEmployeesPage() {
  const { isSuperAdmin } = useUserRole();
  const [items, setItems] = useState<OnboardingInvitation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ iin: '', phone: '' });
  const [returnForm, setReturnForm] = useState({ section: '', comment: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settingsMode, setSettingsMode] = useState(false);
  const [settings, setSettings] = useState<OnboardingSettings>(emptySettings);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0] || null, [items, selectedId]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [data, settingsData] = await Promise.all([onboardingApi.list(), onboardingApi.settings()]);
      setItems(data);
      setSettings(settingsData);
      if (!selectedId && data[0]?.id) setSelectedId(data[0].id);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить анкеты');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const replaceItem = (updated: OnboardingInvitation) => {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    if (updated.id) setSelectedId(updated.id);
  };

  const createInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!/^\d{12}$/.test(form.iin)) {
      setError('ИИН должен состоять из 12 цифр');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await onboardingApi.createInvitation(form);
      setItems((current) => [created, ...current]);
      setSelectedId(created.id || null);
      setForm({ iin: '', phone: '' });
      setSuccess('Приглашение создано. Отправьте ссылку сотруднику через WhatsApp.');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось создать приглашение');
    } finally {
      setIsSubmitting(false);
    }
  };

  const runAction = async (label: string, action: () => Promise<OnboardingInvitation>) => {
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const updated = await action();
      replaceItem(updated);
      setSuccess(label);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Операция не выполнена');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copy = async (value?: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value).catch(() => {});
    setSuccess('Ссылка скопирована');
  };

  const addExtraField = () => {
    setSettings((current) => ({
      ...current,
      extraFields: [...current.extraFields, {
        id: `extra-${Date.now()}`,
        section: 'documents',
        label: '',
        type: 'text',
        required: false,
        options: [],
      }],
    }));
  };

  const updateExtraField = (id: string, patch: Partial<OnboardingExtraField>) => {
    setSettings((current) => ({ ...current, extraFields: current.extraFields.map((field) => field.id === id ? { ...field, ...patch } : field) }));
  };

  const saveSettings = async () => {
    setError('');
    setSuccess('');
    if (settings.extraFields.some((field) => !field.label.trim())) {
      setError('Укажите название для каждого дополнительного поля');
      return;
    }
    setIsSubmitting(true);
    try {
      setSettings(await onboardingApi.updateSettings(settings));
      setSuccess('Настройки анкеты сохранены');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || 'Не удалось сохранить настройки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const draft = selected?.draft || {};
  const identity = draft.identity || {};
  const contacts = draft.contacts || {};
  const documents = draft.documents || {};
  const medical = draft.medical || {};
  const bank = draft.bank || {};

  if (settingsMode && isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-primary-600">BPM onboarding</p>
            <h1 className="text-3xl font-display font-bold text-slate-800">Настройка анкеты</h1>
            <p className="text-slate-500">Обязательные документы и дополнительные поля для новых сотрудников.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setSettingsMode(false)}>К анкетам</Button>
        </div>
        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}
        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Обязательность стандартных документов</h2>
          <p className="mt-1 text-sm text-slate-500">Снятая галочка означает, что файл можно добавить, но без него анкета тоже отправится.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documentRequirementOptions.map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={settings.documentRequirements[key] === true} onChange={(event) => setSettings((current) => ({ ...current, documentRequirements: { ...current.documentRequirements, [key]: event.target.checked } }))} className="h-5 w-5 rounded border-slate-300 text-primary-600" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-slate-900">Дополнительные поля</h2><p className="text-sm text-slate-500">Поля появятся на выбранном этапе анкеты.</p></div>
            <Button type="button" variant="secondary" onClick={addExtraField} icon={<Plus className="h-4 w-4" />}>Добавить поле</Button>
          </div>
          <div className="mt-5 space-y-4">
            {settings.extraFields.length === 0 && <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">Дополнительных полей пока нет</div>}
            {settings.extraFields.map((field) => (
              <div key={field.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1.3fr_1fr_1fr_auto]">
                <Input label="Название" value={field.label} onChange={(event) => updateExtraField(field.id, { label: event.target.value })} placeholder="Например: Размер халата" />
                <Select label="Раздел" value={field.section} options={extraFieldSections} onChange={(event) => updateExtraField(field.id, { section: event.target.value as OnboardingExtraFieldSection })} />
                <Select label="Тип поля" value={field.type} options={extraFieldTypes} onChange={(event) => updateExtraField(field.id, { type: event.target.value as OnboardingExtraFieldType })} />
                <button type="button" title="Удалить поле" onClick={() => setSettings((current) => ({ ...current, extraFields: current.extraFields.filter((item) => item.id !== field.id) }))} className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-5 w-5" /></button>
                <Input label="Подсказка" value={field.placeholder || ''} onChange={(event) => updateExtraField(field.id, { placeholder: event.target.value })} placeholder="Текст внутри поля" />
                {field.type === 'select' && <Input label="Варианты через запятую" value={(field.options || []).join(', ')} onChange={(event) => updateExtraField(field.id, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />}
                <label className="flex items-center gap-3 pt-6 text-sm text-slate-700"><input type="checkbox" checked={field.required} onChange={(event) => updateExtraField(field.id, { required: event.target.checked })} className="h-5 w-5 rounded border-slate-300 text-primary-600" />Обязательно</label>
              </div>
            ))}
          </div>
        </section>
        <div className="flex justify-end"><Button type="button" loading={isSubmitting} onClick={saveSettings} icon={<Save className="h-4 w-4" />}>Сохранить настройки</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-primary-600">HR onboarding</p>
          <h1 className="text-3xl font-display font-bold text-slate-800">Новые сотрудники</h1>
          <p className="text-slate-500">Приглашения, проверка анкет и передача утвержденных данных в 1С.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && <Button type="button" variant="secondary" onClick={() => setSettingsMode(true)} icon={<Settings2 className="h-4 w-4" />}>Настройки анкеты</Button>}
          <Button type="button" variant="secondary" onClick={loadData} icon={<RefreshCw className="h-4 w-4" />}>Обновить</Button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      <form onSubmit={createInvitation} className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Input label="ИИН нового сотрудника" value={form.iin} onChange={(event) => setForm({ ...form, iin: normalizeIin(event.target.value) })} placeholder="12 цифр" />
          <Input label="Телефон для WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: normalizePhone(event.target.value) })} placeholder="+7 700 000 00 00" />
          <Button type="submit" loading={isSubmitting} icon={<UserPlus className="h-4 w-4" />}>Создать приглашение</Button>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h2 className="font-semibold text-slate-900">Список приглашений</h2>
          </div>
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Приглашения еще не созданы</div>
          ) : (
            <div className="max-h-[720px] divide-y divide-slate-100 overflow-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id || null)}
                  className={`w-full p-4 text-left transition-colors hover:bg-slate-50 ${selected?.id === item.id ? 'bg-primary-50/70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.iin}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.phone}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[item.status]}`}>{statusLabels[item.status]}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>До {formatDate(item.expiresAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          {!selected ? (
            <div className="py-16 text-center text-slate-500">Выберите приглашение</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-slate-900">{fullName(draft)}</h2>
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass[selected.status]}`}>{statusLabels[selected.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">ИИН {selected.iin} · попыток осталось {selected.attemptsLeft ?? 0}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void copy(selected.publicUrl)} icon={<Copy className="h-4 w-4" />}>Ссылка</Button>
                  {selected.whatsappUrl && (
                    <a href={selected.whatsappUrl} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm px-3 py-1.5">
                      <ExternalLink className="h-4 w-4" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryRow label="Телефон" value={contacts.mobilePhone || selected.phone} />
                <SummaryRow label="Дата рождения" value={identity.birthDate} />
                <SummaryRow label="Документ" value={documents.documentNumber} />
                <SummaryRow label="Email" value={contacts.email} />
                <SummaryRow label="Должность приема" value={draft.work?.targetPosition} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Личные данные</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>ФИО: {fullName(draft)}</p>
                    <p>Пол: {identity.gender || '-'}</p>
                    <p>Национальность: {identity.nationality || '-'}</p>
                    <p>Гражданство: {identity.citizenship || '-'}</p>
                    <p>Место рождения: {identity.birthPlace || '-'}</p>
                    <p>Фото 3x4: <FileLink files={identity.photo} /></p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Удостоверяющий документ</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Вид: {documents.documentType || '-'}</p>
                    <p>Номер: {documents.documentNumber || '-'}</p>
                    <p>Кем выдан: {documents.issuedBy || '-'}</p>
                    <p>Выдан: {documents.issueDate || '-'} · до {documents.expiryDate || '-'}</p>
                    <p>Файл: <FileLink files={documents.identityFiles} /></p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Адреса</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Прописка: {contacts.registrationAddress || '-'}</p>
                    <p>Проживание: {contacts.livingAddress || '-'}</p>
                    <p>Подпись: <FileLink files={contacts.signatureFile} /></p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Медицинские документы</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Форма 075: <FileLink files={medical.form075} /></p>
                    <p>Несудимость: <FileLink files={medical.noCriminalRecord} /></p>
                    <p>Наркология: <FileLink files={medical.narcology} /></p>
                    <p>Психиатрия: <FileLink files={medical.psychiatry} /></p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Трудоустройство</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Должность приема: {draft.work?.targetPosition || '-'}</p>
                    <p>Предыдущих мест работы: {Array.isArray(draft.work?.items) ? draft.work.items.length : 0}</p>
                    <p>Дополнительные сведения: {draft.work?.awards || '-'}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Банк и финал</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Halyk PDF: <FileLink files={bank.halykRequisites} /></p>
                    <p>Видео 1: {draft.safety?.introReviewed ? 'просмотрено' : 'нет'}</p>
                    <p>Видео 2: {draft.safety?.hospitalSafetyReviewed ? 'просмотрено' : 'нет'}</p>
                  </div>
                </div>
              </div>

              {settings.extraFields.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">Дополнительные сведения</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {settings.extraFields.map((field) => {
                      const value = draft.extraFields?.[field.id];
                      return (
                        <div key={field.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="text-xs uppercase text-slate-400">{field.label}</p>
                          <div className="mt-1 font-medium text-slate-800">
                            {field.type === 'file' ? <FileLink files={value} /> : field.type === 'checkbox' ? (value ? 'Да' : 'Нет') : (value || '-')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <details className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer px-4 py-3 font-medium text-slate-800">Полный черновик анкеты</summary>
                <pre className="max-h-96 overflow-auto border-t border-slate-100 bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(draft, null, 2)}</pre>
              </details>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  Возврат на корректировку
                </h3>
                <div className="mt-3 grid gap-3 lg:grid-cols-[260px_1fr_auto] lg:items-end">
                  <Select options={correctionSections} placeholder="Раздел" value={returnForm.section} onChange={(event) => setReturnForm({ ...returnForm, section: event.target.value })} />
                  <Input placeholder="Комментарий HR" value={returnForm.comment} onChange={(event) => setReturnForm({ ...returnForm, comment: event.target.value })} />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!selected.id || !returnForm.section}
                    onClick={() => selected.id && runAction('Анкета возвращена на корректировку', () => onboardingApi.returnForCorrection(selected.id!, [returnForm.section], returnForm.comment))}
                    icon={<RotateCcw className="h-4 w-4" />}
                  >
                    Вернуть
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!selected.id || isSubmitting} onClick={() => selected.id && runAction('Приглашение продлено на 3 дня', () => onboardingApi.extend(selected.id!))}>Продлить на 3 дня</Button>
                <Button type="button" variant="secondary" disabled={!selected.id || isSubmitting} onClick={() => selected.id && runAction('Приглашение разблокировано', () => onboardingApi.unblock(selected.id!))}>Разблокировать</Button>
                <Button type="button" disabled={!selected.id || isSubmitting || selected.status === 'APPROVED' || selected.status === 'SENT_ONEC'} onClick={() => selected.id && runAction('Анкета утверждена HR', () => onboardingApi.approve(selected.id!))} icon={<ShieldCheck className="h-4 w-4" />}>Утвердить HR</Button>
                <Button type="button" disabled={!selected.id || isSubmitting || selected.status !== 'APPROVED'} onClick={() => selected.id && runAction('Анкета передана в 1С', () => onboardingApi.sendToOneC(selected.id!))} icon={<Send className="h-4 w-4" />}>Передать в 1С</Button>
              </div>

              {selected.history && selected.history.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-primary-500" />
                    История
                  </h3>
                  <div className="space-y-2">
                    {selected.history.map((event, index) => (
                      <div key={`${event.at}-${index}`} className="border-l-2 border-primary-100 pl-3 text-sm">
                        <p className="font-medium text-slate-800">{event.label}</p>
                        <p className="text-slate-400">{formatDate(event.at)} · {event.by}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
