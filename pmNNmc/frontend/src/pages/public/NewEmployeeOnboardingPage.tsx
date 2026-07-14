import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Briefcase,
  CheckCircle2,
  FileCheck2,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import ComboboxSelect, { type ComboboxOption } from '../../components/ui/ComboboxSelect';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { onboardingApi, type OnboardingInvitation } from '../../api/onboarding';
import {
  cityOptionsFor,
  countryOptions,
  kazakhstanRegionOptions,
  nationalityOptions,
} from './onboardingLookups';

type FileMeta = {
  id: number;
  name: string;
  size: number;
  type: string;
  mime?: string;
  url: string;
  lastModified?: number;
};

type AddressValue = {
  country?: string;
  region?: string;
  city?: string;
  details?: string;
};

const steps = [
  { key: 'intro', title: 'Знакомство с ННМЦ', icon: PlayCircle },
  { key: 'law', title: 'Согласие и законность', icon: ShieldCheck },
  { key: 'identity', title: 'Личные данные', icon: UserRound },
  { key: 'documents', title: 'Документы', icon: FileCheck2 },
  { key: 'contacts', title: 'Адреса и контакты', icon: Home },
  { key: 'education', title: 'Образование', icon: GraduationCap },
  { key: 'medical', title: 'Медицинские данные', icon: HeartPulse },
  { key: 'family', title: 'Семья', icon: Users },
  { key: 'work', title: 'Трудовая деятельность', icon: Briefcase },
  { key: 'bank', title: 'Реквизиты', icon: Banknote },
  { key: 'safety-medical', title: 'Безопасность: коды', icon: ShieldCheck },
  { key: 'safety-fire', title: 'Пожарная безопасность', icon: ShieldCheck },
  { key: 'review', title: 'Проверка', icon: FileText },
];

const sectionOptions = {
  gender: [
    { value: 'Мужской', label: 'Мужской' },
    { value: 'Женский', label: 'Женский' },
  ],
  maritalStatus: [
    { value: 'Не состоит в браке', label: 'Не состоит в браке' },
    { value: 'Состоит в зарегистрированном браке', label: 'Состоит в зарегистрированном браке' },
    { value: 'Разведен(а)', label: 'Разведен(а)' },
    { value: 'Вдовец/вдова', label: 'Вдовец/вдова' },
  ],
  documentType: [
    { value: 'Удостоверение личности', label: 'Удостоверение личности' },
    { value: 'Паспорт', label: 'Паспорт' },
    { value: 'Вид на жительство', label: 'Вид на жительство' },
  ],
  languageLevel: [
    { value: 'базовый', label: 'Базовый' },
    { value: 'читает и переводит со словарем', label: 'Читает и переводит со словарем' },
    { value: 'владеет свободно', label: 'Владеет свободно' },
  ],
};

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white';
const today = new Date().toISOString().slice(0, 10);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const namePattern = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі' -]+$/;

function toYoutubeEmbed(url: string) {
  const id = url.match(/[?&]v=([^&]+)/)?.[1] || url.split('/').pop()?.split('?')[0] || '';
  return `https://www.youtube.com/embed/${id}`;
}

function normalizeIin(value: string) {
  return value.replace(/\D/g, '').slice(0, 12);
}

function normalizePhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.startsWith('8')) return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`.trim();
  const source = digits.startsWith('7') ? digits.slice(1) : digits;
  return `+7 ${source.slice(0, 3)} ${source.slice(3, 6)} ${source.slice(6, 8)} ${source.slice(8, 10)}`.trim();
}

function normalizeDateInput(value: string) {
  const [year = '', month = '', day = ''] = value.split('-');
  return [year.slice(0, 4), month.slice(0, 2), day.slice(0, 2)].filter(Boolean).join('-');
}

function formatAddress(value?: AddressValue) {
  return [value?.country, value?.region, value?.city, value?.details].filter(Boolean).join(', ');
}

function hasFiles(value: unknown): value is FileMeta[] {
  return Array.isArray(value) && value.length > 0 && value.every((file) => Number(file?.id) > 0 && Boolean(file?.url));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FileInput({
  label,
  accept,
  multiple,
  required,
  value,
  uploadFiles,
  onChange,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  value?: FileMeta[];
  uploadFiles: (files: File[]) => Promise<FileMeta[]>;
  onChange: (files: FileMeta[]) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (selected.length === 0) return;
    setUploadError('');
    setIsUploading(true);
    try {
      onChange(await uploadFiles(selected));
    } catch (requestError: any) {
      setUploadError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить файл');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`rounded-lg border border-dashed bg-slate-50 p-4 ${required && !hasFiles(value) ? 'border-amber-300' : 'border-slate-300'}`}>
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
        {isUploading ? <Loader2 className="h-5 w-5 animate-spin text-primary-500" /> : <Upload className="h-5 w-5 text-primary-500" />}
        <span>{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={isUploading}
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </label>
      {isUploading && <p className="mt-2 text-xs text-primary-600">Файл загружается...</p>}
      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
      {value && value.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          {value.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <a href={file.url} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">{file.name}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchableField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выберите значение',
  allowCustom = true,
}: {
  label: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
}) {
  return (
    <Field label={label}>
      <ComboboxSelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder="Начните вводить..."
        searchable
        allowCustom={allowCustom}
      />
    </Field>
  );
}

function AddressFields({
  title,
  value,
  onChange,
  withDetails = true,
}: {
  title: string;
  value?: AddressValue;
  onChange: (value: AddressValue) => void;
  withDetails?: boolean;
}) {
  const current = value || {};
  const country = current.country || 'Казахстан';
  const regionOptions = country === 'Казахстан' ? kazakhstanRegionOptions : [];
  const cityOptions = cityOptionsFor(country, current.region || '');
  const update = (patch: Partial<AddressValue>) => onChange({ ...current, country, ...patch });

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 lg:col-span-2">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <SearchableField label="Страна *" value={country} options={countryOptions} onChange={(nextCountry) => onChange({ country: nextCountry, region: '', city: '', details: current.details || '' })} />
        <SearchableField label="Область / регион *" value={current.region || ''} options={regionOptions} onChange={(region) => update({ region, city: '' })} />
        <SearchableField label="Город / населенный пункт *" value={current.city || ''} options={cityOptions} onChange={(city) => update({ city })} />
      </div>
      {withDetails && (
        <Input label="Улица, дом, квартира *" value={current.details || ''} onChange={(event) => update({ details: event.target.value })} />
      )}
    </div>
  );
}

export default function NewEmployeeOnboardingPage() {
  const { token = '' } = useParams();
  const [iin, setIin] = useState('');
  const [invitation, setInvitation] = useState<OnboardingInvitation | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [step, setStep] = useState(0);
  const [verified, setVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(token));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeStep = steps[step];
  const isSubmitted = invitation?.status === 'SUBMITTED' || invitation?.status === 'APPROVED' || invitation?.status === 'SENT_ONEC';

  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    onboardingApi.publicStatus(token)
      .then((data) => setInvitation(data))
      .catch((requestError: any) => setError(requestError?.response?.data?.error?.message || 'Приглашение не найдено'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const updateSection = (section: string, key: string, value: any) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...(current[section] || {}),
        [key]: value,
      },
    }));
  };

  const setSection = (section: string, value: any) => {
    setDraft((current) => ({ ...current, [section]: value }));
  };

  const uploadFiles = async (files: File[]) => {
    if (!verified) throw new Error('Сначала подтвердите ИИН');
    return onboardingApi.uploadFiles(token, iin, files);
  };

  const validateStep = (stepKey: string, data = draft): string[] => {
    const errors: string[] = [];
    const identity = data.identity || {};
    const documents = data.documents || {};
    const contacts = data.contacts || {};
    const medical = data.medical || {};
    const family = data.family || {};

    if (stepKey === 'law' && data.legal?.accepted !== true) {
      errors.push('Подтвердите согласие на обработку персональных данных');
    }
    if (stepKey === 'identity') {
      if (!hasFiles(identity.photo)) errors.push('Загрузите фотографию 3x4');
      for (const [field, label] of [['lastName', 'фамилию'], ['firstName', 'имя']] as const) {
        const value = String(identity[field] || '').trim();
        if (!value) errors.push(`Укажите ${label} как в документе`);
        else if (!namePattern.test(value)) errors.push(`${label[0].toUpperCase()}${label.slice(1)} может содержать только буквы, пробел, дефис и апостроф`);
      }
      if (!identity.noMiddleName) {
        const middleName = String(identity.middleName || '').trim();
        if (!middleName) errors.push('Укажите отчество или отметьте «Отчество отсутствует»');
        else if (!namePattern.test(middleName)) errors.push('Отчество может содержать только буквы, пробел, дефис и апостроф');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(identity.birthDate || '') || identity.birthDate < '1900-01-01' || identity.birthDate > today) {
        errors.push('Укажите корректную дату рождения с годом из 4 цифр');
      }
      if (!identity.gender) errors.push('Выберите пол');
      if (!identity.nationality) errors.push('Выберите национальность');
      if (!identity.citizenship) errors.push('Выберите гражданство');
      const birthPlace = identity.birthPlaceAddress || {};
      if (!birthPlace.country || !birthPlace.region || !birthPlace.city) errors.push('Полностью заполните место рождения: страна, область и город');
    }
    if (stepKey === 'documents') {
      if (!documents.documentType) errors.push('Выберите вид документа');
      if (!documents.documentNumber) errors.push('Укажите номер документа');
      if (documents.documentType === 'Удостоверение личности' && !/^\d{9}$/.test(documents.documentNumber || '')) errors.push('Номер удостоверения личности должен содержать ровно 9 цифр');
      if (!documents.issuedBy) errors.push('Укажите, кем выдан документ');
      if (!documents.issueDate || !documents.expiryDate) errors.push('Укажите дату выдачи и срок действия документа');
      if (!hasFiles(documents.identityFiles)) errors.push('Загрузите PDF документа, удостоверяющего личность');
    }
    if (stepKey === 'contacts') {
      for (const [address, label] of [[contacts.registration, 'адрес по прописке'], [contacts.living, 'адрес проживания']] as const) {
        if (!address?.country || !address?.region || !address?.city || !address?.details) errors.push(`Полностью заполните ${label}`);
      }
      if (String(contacts.mobilePhone || '').replace(/\D/g, '').length !== 11) errors.push('Укажите мобильный телефон в формате +7 700 000 00 00');
      if (contacts.email && !emailPattern.test(contacts.email)) errors.push('Укажите корректный email, например name@example.com');
      if (!hasFiles(contacts.signatureFile)) errors.push('Загрузите образец личной подписи');
    }
    if (stepKey === 'education') {
      for (const [index, item] of (data.education?.items || []).entries()) {
        if (!item.institution || !item.degree || !hasFiles(item.files)) errors.push(`Заполните образование №${index + 1} и загрузите диплом/сертификат`);
      }
    }
    if (stepKey === 'medical') {
      const requiredMedical = [
        ['form075', 'медицинскую справку формы 075'],
        ['noCriminalRecord', 'справку о несудимости'],
        ['narcology', 'справку из наркологического диспансера'],
        ['psychiatry', 'справку из психиатрического диспансера'],
      ];
      for (const [key, label] of requiredMedical) if (!hasFiles(medical[key])) errors.push(`Загрузите ${label}`);
      if (!medical.emergencyContactName || !medical.emergencyContactRelation || String(medical.emergencyContactPhone || '').replace(/\D/g, '').length !== 11) {
        errors.push('Заполните ФИО, степень родства и телефон контактного лица');
      }
    }
    if (stepKey === 'family') {
      if (!family.maritalStatus) errors.push('Выберите семейное положение');
      if (family.maritalStatus === 'Состоит в зарегистрированном браке' && !hasFiles(family.marriageFiles)) errors.push('Загрузите свидетельство о браке');
      for (const [index, member] of (family.members || []).entries()) {
        if (!member.relation || !member.fio || !member.birthDate || !hasFiles(member.files)) errors.push(`Заполните члена семьи №${index + 1} и загрузите подтверждающий документ`);
      }
    }
    if (stepKey === 'bank' && !hasFiles(data.bank?.halykRequisites)) errors.push('Загрузите PDF с банковскими реквизитами Halyk Bank');
    if (stepKey === 'safety-medical' && data.safety?.introReviewed !== true) errors.push('Подтвердите просмотр первого видео');
    if (stepKey === 'safety-fire' && data.safety?.hospitalSafetyReviewed !== true) errors.push('Подтвердите просмотр второго видео');
    return errors;
  };

  const verify = async () => {
    setError('');
    setSuccess('');
    if (!/^\d{12}$/.test(iin)) {
      setError('Введите ИИН из 12 цифр');
      return;
    }
    setIsSaving(true);
    try {
      const data = await onboardingApi.verify(token, iin);
      const initialDraft = {
        ...(data.draft || {}),
        identity: {
          ...(data.draft?.identity || {}),
          citizenship: data.draft?.identity?.citizenship || 'Казахстан',
        },
        documents: {
          ...(data.draft?.documents || {}),
          documentType: data.draft?.documents?.documentType || 'Удостоверение личности',
        },
      };
      setInvitation(data);
      setDraft(initialDraft);
      setStep(Number(data.draft?.currentStep || 0));
      setVerified(true);
      setSuccess('ИИН подтвержден. Можно начинать заполнение анкеты.');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось подтвердить ИИН');
    } finally {
      setIsSaving(false);
    }
  };

  const save = async (nextStep = step) => {
    if (!verified) return;
    setIsSaving(true);
    setError('');
    try {
      const data = await onboardingApi.saveDraft(token, iin, draft, nextStep);
      setInvitation(data);
      setDraft(data.draft || draft);
      setStep(nextStep);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось сохранить черновик');
    } finally {
      setIsSaving(false);
    }
  };

  const next = () => {
    const errors = validateStep(activeStep.key);
    if (errors.length > 0) {
      setError(errors.join('. '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    void save(Math.min(step + 1, steps.length - 1));
  };
  const previous = () => setStep((current) => Math.max(current - 1, 0));

  const submit = async () => {
    setError('');
    setSuccess('');
    const allErrors = steps.flatMap((item) => validateStep(item.key));
    if (allErrors.length > 0) {
      setError(allErrors[0]);
      return;
    }
    setIsSaving(true);
    try {
      const data = await onboardingApi.submit(token, iin);
      setInvitation(data);
      setDraft(data.draft || draft);
      setSuccess('Анкета отправлена в отдел кадров. Ожидайте статус проверки.');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось отправить анкету');
    } finally {
      setIsSaving(false);
    }
  };

  const renderStep = () => {
    if (activeStep.key === 'intro') {
      return (
        <div className="space-y-5">
          <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <iframe
              title="АО ННМЦ"
              src={toYoutubeEmbed('https://www.youtube.com/watch?v=C6zpxv_E5fY')}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
            Добро пожаловать в АО "ННМЦ". После просмотра видео нажмите "Далее" и заполните анкету. Черновик будет сохраняться после каждого этапа.
          </div>
        </div>
      );
    }

    if (activeStep.key === 'law') {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
            <p className="font-semibold text-slate-900">Согласие на сбор и обработку персональных данных</p>
            <p className="mt-3">
              АО "ННМЦ" собирает персональные данные кандидата/нового сотрудника для оформления трудовых отношений, ведения кадрового учета,
              подготовки документов, соблюдения требований Трудового кодекса Республики Казахстан и внутренних процедур работодателя.
            </p>
            <p className="mt-3">
              Передавая данные, вы подтверждаете их достоверность и соглашаетесь с использованием сведений и файлов для проверки отделом кадров,
              формирования заявления о приеме на работу и последующей передачи структурированных данных в 1С после утверждения HR.
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.legal?.accepted === true}
              onChange={(event) => updateSection('legal', 'accepted', event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>Я ознакомлен(а) с уведомлением и даю согласие на обработку персональных данных.</span>
          </label>
        </div>
      );
    }

    if (activeStep.key === 'identity') {
      const section = draft.identity || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <FileInput label="Фото 3x4" accept="image/png,image/jpeg" required value={section.photo} uploadFiles={uploadFiles} onChange={(files) => updateSection('identity', 'photo', files)} />
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Фото нужно для личного дела. Обычно отдел кадров предупреждает требования заранее.</div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900 lg:col-span-2">
            Внесите ФИО строго так, как оно указано в удостоверении личности или паспорте. Не используйте сокращения.
          </div>
          <Input label="Фамилия по документу *" value={section.lastName || ''} onChange={(event) => updateSection('identity', 'lastName', event.target.value.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі' -]/g, ''))} />
          <Input label="Имя по документу *" value={section.firstName || ''} onChange={(event) => updateSection('identity', 'firstName', event.target.value.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі' -]/g, ''))} />
          <Input label="Отчество по документу *" value={section.middleName || ''} onChange={(event) => updateSection('identity', 'middleName', event.target.value.replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі' -]/g, ''))} disabled={section.noMiddleName} />
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-600">
            <input type="checkbox" checked={section.noMiddleName === true} onChange={(event) => updateSection('identity', 'noMiddleName', event.target.checked)} />
            Отчество отсутствует
          </label>
          <Input label="ИИН" value={iin} readOnly className="bg-slate-100" />
          <Input label="Дата рождения *" type="date" min="1900-01-01" max={today} value={section.birthDate || ''} onChange={(event) => updateSection('identity', 'birthDate', normalizeDateInput(event.target.value))} />
          <Select label="Пол *" placeholder="Выберите" options={sectionOptions.gender} value={section.gender || ''} onChange={(event) => updateSection('identity', 'gender', event.target.value)} />
          <SearchableField label="Национальность *" value={section.nationality || ''} options={nationalityOptions} onChange={(value) => updateSection('identity', 'nationality', value)} />
          <SearchableField label="Гражданство *" value={section.citizenship || 'Казахстан'} options={countryOptions} onChange={(value) => updateSection('identity', 'citizenship', value)} />
          <AddressFields
            title="Место рождения"
            withDetails={false}
            value={section.birthPlaceAddress}
            onChange={(value) => setSection('identity', { ...section, birthPlaceAddress: value, birthPlace: formatAddress(value) })}
          />
        </div>
      );
    }

    if (activeStep.key === 'documents') {
      const section = draft.documents || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Select label="Вид документа" options={sectionOptions.documentType} value={section.documentType || 'Удостоверение личности'} onChange={(event) => updateSection('documents', 'documentType', event.target.value)} />
          <Input
            label={`${section.documentType === 'Удостоверение личности' ? 'Номер удостоверения (9 цифр)' : 'Номер документа'} *`}
            inputMode={section.documentType === 'Удостоверение личности' ? 'numeric' : 'text'}
            maxLength={section.documentType === 'Удостоверение личности' ? 9 : 30}
            value={section.documentNumber || ''}
            onChange={(event) => updateSection('documents', 'documentNumber', section.documentType === 'Удостоверение личности' ? event.target.value.replace(/\D/g, '').slice(0, 9) : event.target.value.slice(0, 30))}
          />
          <Input label="Кем выдан *" value={section.issuedBy || ''} onChange={(event) => updateSection('documents', 'issuedBy', event.target.value)} />
          <Input label="Дата выдачи *" type="date" min="1900-01-01" max={today} value={section.issueDate || ''} onChange={(event) => updateSection('documents', 'issueDate', normalizeDateInput(event.target.value))} />
          <Input label="Срок действия *" type="date" min="1900-01-01" value={section.expiryDate || ''} onChange={(event) => updateSection('documents', 'expiryDate', normalizeDateInput(event.target.value))} />
          <FileInput label="PDF документа, максимум 2 файла" accept="application/pdf" multiple required value={section.identityFiles} uploadFiles={uploadFiles} onChange={(files) => updateSection('documents', 'identityFiles', files.slice(0, 2))} />
        </div>
      );
    }

    if (activeStep.key === 'contacts') {
      const section = draft.contacts || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <AddressFields title="Адрес по прописке" value={section.registration} onChange={(value) => setSection('contacts', { ...section, registration: value, registrationAddress: formatAddress(value) })} />
          <AddressFields title="Адрес проживания" value={section.living} onChange={(value) => setSection('contacts', { ...section, living: value, livingAddress: formatAddress(value) })} />
          <Input label="Мобильный телефон *" inputMode="tel" value={section.mobilePhone || ''} onChange={(event) => updateSection('contacts', 'mobilePhone', normalizePhoneInput(event.target.value))} placeholder="+7 700 000 00 00" />
          <Input label="Домашний телефон" value={section.homePhone || ''} onChange={(event) => updateSection('contacts', 'homePhone', event.target.value)} />
          <Input label="Email, если есть" type="email" inputMode="email" placeholder="name@example.com" value={section.email || ''} onChange={(event) => updateSection('contacts', 'email', event.target.value.trim())} />
          <FileInput label="Образец личной подписи" accept="application/pdf,image/png,image/jpeg" required value={section.signatureFile} uploadFiles={uploadFiles} onChange={(files) => updateSection('contacts', 'signatureFile', files.slice(0, 1))} />
        </div>
      );
    }

    if (activeStep.key === 'education') {
      const rows = Array.isArray(draft.education?.items) ? draft.education.items : [];
      const languages = Array.isArray(draft.education?.languages) ? draft.education.languages : [];
      return (
        <div className="space-y-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Учебные заведения</h3>
            <Button type="button" size="sm" onClick={() => setSection('education', { ...(draft.education || {}), items: [...rows, {}] })}>Добавить</Button>
          </div>
          {rows.map((row: any, index: number) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-3">
              <Input label="Учебное заведение" value={row.institution || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, institution: event.target.value }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <Input label="Степень" value={row.degree || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, degree: event.target.value }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <Input label="Факультет/отделение" value={row.faculty || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, faculty: event.target.value }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <Input label="Год поступления" value={row.startYear || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, startYear: event.target.value.replace(/\D/g, '').slice(0, 4) }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <Input label="Год окончания" value={row.endYear || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, endYear: event.target.value.replace(/\D/g, '').slice(0, 4) }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <Input label="Номер диплома" value={row.diplomaNumber || ''} onChange={(event) => {
                const nextRows = [...rows]; nextRows[index] = { ...row, diplomaNumber: event.target.value }; setSection('education', { ...(draft.education || {}), items: nextRows });
              }} />
              <div className="lg:col-span-3">
                <FileInput label="Диплом / сертификаты" accept="application/pdf,image/png,image/jpeg" multiple required value={row.files} uploadFiles={uploadFiles} onChange={(files) => {
                  const nextRows = [...rows]; nextRows[index] = { ...row, files }; setSection('education', { ...(draft.education || {}), items: nextRows });
                }} />
              </div>
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-2">
            <h3 className="font-semibold text-slate-800">Языки</h3>
            <Button type="button" size="sm" onClick={() => setSection('education', { ...(draft.education || {}), languages: [...languages, {}] })}>Добавить</Button>
          </div>
          {languages.map((row: any, index: number) => (
            <div key={index} className="grid gap-3 lg:grid-cols-2">
              <Input label="Язык" value={row.language || ''} onChange={(event) => {
                const nextRows = [...languages]; nextRows[index] = { ...row, language: event.target.value }; setSection('education', { ...(draft.education || {}), languages: nextRows });
              }} />
              <Select label="Уровень" options={sectionOptions.languageLevel} value={row.level || ''} onChange={(event) => {
                const nextRows = [...languages]; nextRows[index] = { ...row, level: event.target.value }; setSection('education', { ...(draft.education || {}), languages: nextRows });
              }} />
            </div>
          ))}
          <textarea className={inputClass} rows={4} placeholder="Научные работы, награды, хобби, дополнительные сведения" value={draft.education?.additional || ''} onChange={(event) => updateSection('education', 'additional', event.target.value)} />
        </div>
      );
    }

    if (activeStep.key === 'medical') {
      const section = draft.medical || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <FileInput label="Медицинская справка форма 075" accept="application/pdf" required value={section.form075} uploadFiles={uploadFiles} onChange={(files) => updateSection('medical', 'form075', files.slice(0, 1))} />
          <FileInput label="Справка о несудимости" accept="application/pdf" required value={section.noCriminalRecord} uploadFiles={uploadFiles} onChange={(files) => updateSection('medical', 'noCriminalRecord', files.slice(0, 1))} />
          <FileInput label="Справка с наркологического диспансера" accept="application/pdf" required value={section.narcology} uploadFiles={uploadFiles} onChange={(files) => updateSection('medical', 'narcology', files.slice(0, 1))} />
          <FileInput label="Справка с психиатрического диспансера" accept="application/pdf" required value={section.psychiatry} uploadFiles={uploadFiles} onChange={(files) => updateSection('medical', 'psychiatry', files.slice(0, 1))} />
          <Input label="Группа крови" value={section.bloodType || ''} onChange={(event) => updateSection('medical', 'bloodType', event.target.value)} />
          <Input label="Контактное лицо при экстренном случае" value={section.emergencyContactName || ''} onChange={(event) => updateSection('medical', 'emergencyContactName', event.target.value)} />
          <Input label="Степень родства" value={section.emergencyContactRelation || ''} onChange={(event) => updateSection('medical', 'emergencyContactRelation', event.target.value)} />
          <Input label="Контактный номер" value={section.emergencyContactPhone || ''} onChange={(event) => updateSection('medical', 'emergencyContactPhone', normalizePhoneInput(event.target.value))} />
        </div>
      );
    }

    if (activeStep.key === 'family') {
      const rows = Array.isArray(draft.family?.members) ? draft.family.members : [];
      return (
        <div className="space-y-5">
          <Select label="Семейное положение" options={sectionOptions.maritalStatus} value={draft.family?.maritalStatus || ''} onChange={(event) => updateSection('family', 'maritalStatus', event.target.value)} />
          <FileInput label="Свидетельство о браке / расторжении брака" accept="application/pdf,image/png,image/jpeg" required={draft.family?.maritalStatus === 'Состоит в зарегистрированном браке'} value={draft.family?.marriageFiles} uploadFiles={uploadFiles} onChange={(files) => updateSection('family', 'marriageFiles', files)} />
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Состав семьи</h3>
            <Button type="button" size="sm" onClick={() => setSection('family', { ...(draft.family || {}), members: [...rows, {}] })}>Добавить</Button>
          </div>
          {rows.map((row: any, index: number) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-4">
              {['relation', 'fio', 'birthDate', 'contactPhone'].map((key) => (
                <Input
                  key={key}
                  label={{ relation: 'Степень родства', fio: 'ФИО', birthDate: 'Дата рождения', contactPhone: 'Контактный номер' }[key] || key}
                  type={key === 'birthDate' ? 'date' : 'text'}
                  value={row[key] || ''}
                  onChange={(event) => {
                    const nextRows = [...rows];
                    nextRows[index] = { ...row, [key]: key === 'contactPhone' ? normalizePhoneInput(event.target.value) : key === 'birthDate' ? normalizeDateInput(event.target.value) : event.target.value };
                    setSection('family', { ...(draft.family || {}), members: nextRows });
                  }}
                />
              ))}
              <div className="lg:col-span-4">
                <FileInput label="Свидетельство о рождении / документ" accept="application/pdf,image/png,image/jpeg" required value={row.files} uploadFiles={uploadFiles} onChange={(files) => {
                  const nextRows = [...rows]; nextRows[index] = { ...row, files }; setSection('family', { ...(draft.family || {}), members: nextRows });
                }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeStep.key === 'work') {
      const rows = Array.isArray(draft.work?.items) ? draft.work.items : [];
      return (
        <div className="space-y-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold text-slate-800">Предыдущие места работы</h3>
            <Button type="button" size="sm" onClick={() => setSection('work', { ...(draft.work || {}), items: [...rows, {}] })}>Добавить</Button>
          </div>
          {rows.map((row: any, index: number) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-3">
              {['from', 'to', 'organization', 'position', 'address', 'experienceType'].map((key) => (
                <Input
                  key={key}
                  label={{ from: 'С', to: 'По', organization: 'Организация', position: 'Должность', address: 'Адрес организации', experienceType: 'Вид стажа' }[key] || key}
                  type={key === 'from' || key === 'to' ? 'date' : 'text'}
                  value={row[key] || ''}
                  onChange={(event) => {
                    const nextRows = [...rows]; nextRows[index] = { ...row, [key]: key === 'from' || key === 'to' ? normalizeDateInput(event.target.value) : event.target.value }; setSection('work', { ...(draft.work || {}), items: nextRows });
                  }}
                />
              ))}
            </div>
          ))}
          <textarea className={inputClass} rows={3} placeholder="Награды, дополнительная трудовая информация" value={draft.work?.awards || ''} onChange={(event) => updateSection('work', 'awards', event.target.value)} />
        </div>
      );
    }

    if (activeStep.key === 'bank') {
      return (
        <div className="space-y-4">
          <FileInput label="PDF с банковскими реквизитами Halyk Bank" accept="application/pdf" required value={draft.bank?.halykRequisites} uploadFiles={uploadFiles} onChange={(files) => updateSection('bank', 'halykRequisites', files.slice(0, 1))} />
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Пока реквизиты принимаются файлом. Если позже понадобится ручной ввод IBAN/BIC, добавим отдельные поля.
          </div>
        </div>
      );
    }

    if (activeStep.key === 'safety-medical') {
      return (
        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Безопасность: больничный лист и коды цветов</h3>
            <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <iframe title="Безопасность 1" src={toYoutubeEmbed('https://www.youtube.com/watch?v=LastBYmQ634')} className="h-full w-full" allowFullScreen />
            </div>
            <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800">
              <input type="checkbox" checked={draft.safety?.introReviewed === true} onChange={(event) => updateSection('safety', 'introReviewed', event.target.checked)} className="h-7 w-7 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              Я посмотрел(а) первое видео полностью
            </label>
          </div>
        </div>
      );
    }

    if (activeStep.key === 'safety-fire') {
      return (
        <div className="space-y-5">
          <h3 className="font-semibold text-slate-800">Пожарная и техническая безопасность в больнице</h3>
          <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <iframe title="Безопасность 2" src={toYoutubeEmbed('https://www.youtube.com/watch?v=aUNTztjE_ss')} className="h-full w-full" allowFullScreen />
          </div>
          <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800">
            <input type="checkbox" checked={draft.safety?.hospitalSafetyReviewed === true} onChange={(event) => updateSection('safety', 'hospitalSafetyReviewed', event.target.checked)} className="h-7 w-7 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
            Я посмотрел(а) второе видео полностью
          </label>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm uppercase tracking-wide text-slate-500">Заявление о приеме на работу</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">
            {`${draft.identity?.lastName || ''} ${draft.identity?.firstName || ''} ${draft.identity?.middleName || ''}`.trim() || 'Новый сотрудник'}
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Прошу принять меня на работу в АО "ННМЦ". Персональные данные и приложенные документы предоставлены мной добровольно
            для оформления трудовых отношений и последующей передачи в 1С после проверки отделом кадров.
          </p>
          <p className="mt-3 text-sm text-slate-500">ЭЦП: опционально. Место для подписи будет добавлено в финальную печатную форму.</p>
        </div>
        <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
          После отправки анкета попадет в отдел кадров. При необходимости HR вернет раздел на корректировку.
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <img src="/logo.png" alt="ННМЦ" className="mx-auto mb-4 h-16 w-16 object-contain" />
          <h1 className="text-xl font-semibold text-slate-900">Нужна ссылка от отдела кадров</h1>
          <p className="mt-2 text-sm text-slate-500">Для начала онбординга HR создает приглашение по ИИН и отправляет персональную ссылку в WhatsApp.</p>
          <Link to="/login" className="mt-5 inline-block text-sm font-medium text-primary-600">Вернуться ко входу</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-50">
      <header className="border-b border-white/60 bg-white/75 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ННМЦ" className="h-11 w-11 object-contain" />
            <div>
              <p className="font-semibold text-slate-900">АО "ННМЦ"</p>
              <p className="text-xs text-slate-500">Онбординг нового сотрудника</p>
            </div>
          </div>
          <Link to="/login" className="text-sm font-medium text-slate-500 hover:text-slate-800">Вход в систему</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr] lg:px-6">
        <aside className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase text-slate-400">Прогресс</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${verified ? progress : 0}%` }} />
          </div>
          <div className="mt-5 space-y-1">
            {steps.map((item, index) => (
              <div key={item.key} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${index === step ? 'bg-primary-50 font-medium text-primary-700' : index < step ? 'text-slate-700' : 'text-slate-400'}`}>
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur lg:p-7">
          {!verified ? (
            <div className="mx-auto max-w-lg space-y-5 py-10">
              <div className="text-center">
                <img src="/logo.png" alt="ННМЦ" className="mx-auto mb-4 h-16 w-16 object-contain" />
                <h1 className="text-2xl font-bold text-slate-900">Анкета нового сотрудника</h1>
                <p className="mt-2 text-sm text-slate-500">Введите ИИН, по которому отдел кадров создал приглашение.</p>
              </div>
              <Input label="ИИН" value={iin} maxLength={12} onChange={(event: ChangeEvent<HTMLInputElement>) => setIin(normalizeIin(event.target.value))} placeholder="12 цифр" />
              {invitation?.status === 'RETURNED' && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">HR вернул анкету на корректировку. После входа будут показаны разделы для исправления.</div>
              )}
              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <Button type="button" className="w-full" loading={isSaving} onClick={verify}>Начать заполнение</Button>
            </div>
          ) : isSubmitted ? (
            <div className="mx-auto max-w-xl py-16 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
              <h1 className="text-2xl font-bold text-slate-900">Анкета отправлена</h1>
              <p className="mt-2 text-slate-500">Данные переданы в отдел кадров. Статус проверки можно уточнить у HR.</p>
              {invitation?.status && <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">Текущий статус: {invitation.status}</p>}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase text-primary-600">Шаг {step + 1} из {steps.length}</p>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900">{activeStep.title}</h1>
                </div>
                <div className="text-sm text-slate-500">Сохранение после каждого шага</div>
              </div>

              {invitation?.status === 'RETURNED' && (invitation.returnedSections?.length || invitation.hrComment) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" /> Нужно исправить</div>
                  <p className="mt-2">Разделы: {invitation.returnedSections?.join(', ') || 'не указаны'}</p>
                  {invitation.hrComment && <p className="mt-1">Комментарий HR: {invitation.hrComment}</p>}
                </div>
              )}
              {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

              {renderStep()}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="secondary" onClick={previous} disabled={step === 0 || isSaving} icon={<ArrowLeft className="h-4 w-4" />}>Назад</Button>
                {activeStep.key === 'review' ? (
                  <Button type="button" onClick={submit} loading={isSaving} icon={<CheckCircle2 className="h-4 w-4" />}>Отправить в отдел кадров</Button>
                ) : (
                  <Button type="button" onClick={next} loading={isSaving} icon={<ArrowRight className="h-4 w-4" />}>Далее</Button>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
