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
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { onboardingApi, type OnboardingInvitation } from '../../api/onboarding';

type FileMeta = { name: string; size: number; type: string; lastModified: number };

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
  { key: 'safety', title: 'Безопасность', icon: ShieldCheck },
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

function filesToMeta(files: FileList | null): FileMeta[] {
  return Array.from(files || []).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  }));
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
  value,
  onChange,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  value?: FileMeta[];
  onChange: (files: FileMeta[]) => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
        <Upload className="h-5 w-5 text-primary-500" />
        <span>{label}</span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => onChange(filesToMeta(event.target.files))}
        />
      </label>
      {value && value.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          {value.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span>{file.name}</span>
            </div>
          ))}
        </div>
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
      setInvitation(data);
      setDraft(data.draft || {});
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

  const next = () => void save(Math.min(step + 1, steps.length - 1));
  const previous = () => setStep((current) => Math.max(current - 1, 0));

  const submit = async () => {
    setError('');
    setSuccess('');
    if (!draft.safety?.introReviewed || !draft.safety?.hospitalSafetyReviewed) {
      setError('Отметьте просмотр двух видео по безопасности');
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
          <FileInput label="Фото 3x4" accept="image/png,image/jpeg" value={section.photo} onChange={(files) => updateSection('identity', 'photo', files)} />
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Фото нужно для личного дела. Обычно отдел кадров предупреждает требования заранее.</div>
          <Input label="Фамилия" value={section.lastName || ''} onChange={(event) => updateSection('identity', 'lastName', event.target.value)} />
          <Input label="Имя" value={section.firstName || ''} onChange={(event) => updateSection('identity', 'firstName', event.target.value)} />
          <Input label="Отчество" value={section.middleName || ''} onChange={(event) => updateSection('identity', 'middleName', event.target.value)} disabled={section.noMiddleName} />
          <label className="flex items-center gap-2 pt-7 text-sm text-slate-600">
            <input type="checkbox" checked={section.noMiddleName === true} onChange={(event) => updateSection('identity', 'noMiddleName', event.target.checked)} />
            Отчество отсутствует
          </label>
          <Input label="ИИН" value={iin} readOnly className="bg-slate-100" />
          <Input label="Дата рождения" type="date" value={section.birthDate || ''} onChange={(event) => updateSection('identity', 'birthDate', event.target.value)} />
          <Select label="Пол" placeholder="Выберите" options={sectionOptions.gender} value={section.gender || ''} onChange={(event) => updateSection('identity', 'gender', event.target.value)} />
          <Input label="Национальность" value={section.nationality || ''} onChange={(event) => updateSection('identity', 'nationality', event.target.value)} />
          <Input label="Место рождения" value={section.birthPlace || ''} onChange={(event) => updateSection('identity', 'birthPlace', event.target.value)} />
          <Input label="Гражданство" value={section.citizenship || 'КАЗАХСТАН'} onChange={(event) => updateSection('identity', 'citizenship', event.target.value)} />
        </div>
      );
    }

    if (activeStep.key === 'documents') {
      const section = draft.documents || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Select label="Вид документа" options={sectionOptions.documentType} value={section.documentType || 'Удостоверение личности'} onChange={(event) => updateSection('documents', 'documentType', event.target.value)} />
          <Input label="Номер документа" value={section.documentNumber || ''} onChange={(event) => updateSection('documents', 'documentNumber', event.target.value)} />
          <Input label="Кем выдан" value={section.issuedBy || ''} onChange={(event) => updateSection('documents', 'issuedBy', event.target.value)} />
          <Input label="Дата выдачи" type="date" value={section.issueDate || ''} onChange={(event) => updateSection('documents', 'issueDate', event.target.value)} />
          <Input label="Срок действия" type="date" value={section.expiryDate || ''} onChange={(event) => updateSection('documents', 'expiryDate', event.target.value)} />
          <FileInput label="PDF удостоверения личности, максимум 2 файла" accept="application/pdf" multiple value={section.identityFiles} onChange={(files) => updateSection('documents', 'identityFiles', files.slice(0, 2))} />
        </div>
      );
    }

    if (activeStep.key === 'contacts') {
      const section = draft.contacts || {};
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Input label="Адрес по прописке" value={section.registrationAddress || ''} onChange={(event) => updateSection('contacts', 'registrationAddress', event.target.value)} />
          <Input label="Адрес проживания" value={section.livingAddress || ''} onChange={(event) => updateSection('contacts', 'livingAddress', event.target.value)} />
          <Input label="Мобильный телефон" value={section.mobilePhone || ''} onChange={(event) => updateSection('contacts', 'mobilePhone', normalizePhoneInput(event.target.value))} />
          <Input label="Домашний телефон" value={section.homePhone || ''} onChange={(event) => updateSection('contacts', 'homePhone', event.target.value)} />
          <Input label="Email, если есть" type="email" value={section.email || ''} onChange={(event) => updateSection('contacts', 'email', event.target.value)} />
          <FileInput label="Образец личной подписи" accept="application/pdf,image/png,image/jpeg" value={section.signatureFile} onChange={(files) => updateSection('contacts', 'signatureFile', files.slice(0, 1))} />
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
                <FileInput label="Диплом / сертификаты" accept="application/pdf,image/png,image/jpeg" multiple value={row.files} onChange={(files) => {
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
          <FileInput label="Медицинская справка форма 075" accept="application/pdf" value={section.form075} onChange={(files) => updateSection('medical', 'form075', files.slice(0, 1))} />
          <FileInput label="Справка о несудимости" accept="application/pdf" value={section.noCriminalRecord} onChange={(files) => updateSection('medical', 'noCriminalRecord', files.slice(0, 1))} />
          <FileInput label="Справка с наркологического диспансера" accept="application/pdf" value={section.narcology} onChange={(files) => updateSection('medical', 'narcology', files.slice(0, 1))} />
          <FileInput label="Справка с психиатрического диспансера" accept="application/pdf" value={section.psychiatry} onChange={(files) => updateSection('medical', 'psychiatry', files.slice(0, 1))} />
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
          <FileInput label="Свидетельство о браке / расторжении брака" accept="application/pdf,image/png,image/jpeg" value={draft.family?.marriageFiles} onChange={(files) => updateSection('family', 'marriageFiles', files)} />
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
                    nextRows[index] = { ...row, [key]: key === 'contactPhone' ? normalizePhoneInput(event.target.value) : event.target.value };
                    setSection('family', { ...(draft.family || {}), members: nextRows });
                  }}
                />
              ))}
              <div className="lg:col-span-4">
                <FileInput label="Свидетельство о рождении / документ" accept="application/pdf,image/png,image/jpeg" value={row.files} onChange={(files) => {
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
                    const nextRows = [...rows]; nextRows[index] = { ...row, [key]: event.target.value }; setSection('work', { ...(draft.work || {}), items: nextRows });
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
          <FileInput label="PDF с банковскими реквизитами Halyk Bank" accept="application/pdf" value={draft.bank?.halykRequisites} onChange={(files) => updateSection('bank', 'halykRequisites', files.slice(0, 1))} />
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Пока реквизиты принимаются файлом. Если позже понадобится ручной ввод IBAN/BIC, добавим отдельные поля.
          </div>
        </div>
      );
    }

    if (activeStep.key === 'safety') {
      return (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Безопасность: больничный лист и коды цветов</h3>
            <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <iframe title="Безопасность 1" src={toYoutubeEmbed('https://www.youtube.com/watch?v=LastBYmQ634')} className="h-full w-full" allowFullScreen />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.safety?.introReviewed === true} onChange={(event) => updateSection('safety', 'introReviewed', event.target.checked)} />
              Просмотрено
            </label>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Пожарная и техническая безопасность в больнице</h3>
            <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <iframe title="Безопасность 2" src={toYoutubeEmbed('https://www.youtube.com/watch?v=aUNTztjE_ss')} className="h-full w-full" allowFullScreen />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.safety?.hospitalSafetyReviewed === true} onChange={(event) => updateSection('safety', 'hospitalSafetyReviewed', event.target.checked)} />
              Просмотрено
            </label>
          </div>
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
