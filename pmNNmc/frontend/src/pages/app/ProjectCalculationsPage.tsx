import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  FolderOpen,
  History,
  LockKeyhole,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  ExtraCostCategory,
  ProjectCalculation,
  ProjectCalculationContext,
  ProjectCalculationInput,
  ProjectCalculationStatus,
  ProjectExtraCost,
  projectCalculationsApi,
} from '../../api/projectCalculations';
import type { MediaFile, User } from '../../types';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import { getMediaUrl } from '../../utils/media';

const STATUS_LABELS: Record<ProjectCalculationStatus, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлено',
  IN_REVIEW: 'На рассмотрении',
  RETURNED: 'Возвращено',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
};

const STATUS_STYLES: Record<ProjectCalculationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-amber-100 text-amber-800',
  RETURNED: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Создан черновик',
  SUBMITTED: 'Отправлено на согласование',
  RESUBMITTED: 'Повторно отправлено на согласование',
  REVIEW_STARTED: 'Начато рассмотрение',
  RETURNED_FOR_REVISION: 'Возвращено на доработку',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
  REOPENED: 'Переоткрыто супер-администратором',
};

const COST_CATEGORIES: Array<{ value: ExtraCostCategory; label: string }> = [
  { value: 'licenses', label: 'Лицензии' },
  { value: 'infrastructure', label: 'Инфраструктура' },
  { value: 'travel', label: 'Командировки' },
  { value: 'contractors', label: 'Подрядчики' },
  { value: 'purchases', label: 'Закупки' },
];

type FormState = ProjectCalculationInput;

const emptyForm = (context: ProjectCalculationContext | null): FormState => ({
  title: '',
  description: '',
  customer: '',
  startDate: '',
  endDate: '',
  departmentId: context?.department?.id,
  team: [],
  actualHours: 0,
  actualExtraCosts: [],
  aiHours: 0,
  aiExtraCosts: [],
  marketAmount: 0,
  aiReportFileIds: [],
  marketFileIds: [],
});

function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function money(value: unknown): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(numberValue(value)) + ' ₸';
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function userName(user?: Partial<User> | null): string {
  return [user?.lastName, user?.firstName].filter(Boolean).join(' ').trim() || user?.fullName || user?.username || user?.email || 'Сотрудник';
}

function errorMessage(error: any, fallback: string): string {
  return error?.response?.data?.error?.message || error?.response?.data?.message || fallback;
}

function StatusBadge({ status }: { status: ProjectCalculationStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

function totals(form: FormState, hourlyRate: number) {
  const sum = (items: ProjectExtraCost[]) => items.reduce((result, item) => result + numberValue(item.amount), 0);
  return {
    actual: numberValue(form.actualHours) * hourlyRate + sum(form.actualExtraCosts),
    ai: numberValue(form.aiHours) * hourlyRate + sum(form.aiExtraCosts),
  };
}

function projectToForm(project: ProjectCalculation): FormState {
  return {
    title: project.title || '',
    description: project.description || '',
    customer: project.customer || '',
    startDate: project.startDate || '',
    endDate: project.endDate || '',
    departmentId: project.department?.id,
    team: (project.teamSnapshot || []).map((member) => ({ userId: member.userId, role: member.role || '' })),
    actualHours: numberValue(project.actualHours),
    actualExtraCosts: project.actualExtraCosts || [],
    aiHours: numberValue(project.aiHours),
    aiExtraCosts: project.aiExtraCosts || [],
    marketAmount: numberValue(project.marketAmount),
    aiReportFileIds: (project.aiReportFiles || []).map((file) => file.id),
    marketFileIds: (project.marketFiles || []).map((file) => file.id),
  };
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1.5 block font-medium">{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500';

function ExtraCostsEditor({ value, onChange, disabled }: { value: ProjectExtraCost[]; onChange: (value: ProjectExtraCost[]) => void; disabled: boolean }) {
  const add = () => onChange([...value, { id: crypto.randomUUID(), category: 'licenses', description: '', amount: 0 }]);
  const update = (index: number, patch: Partial<ProjectExtraCost>) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const remove = (index: number) => onChange(value.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={item.id || index} className="grid gap-2 sm:grid-cols-[160px_1fr_150px_40px]">
          <select disabled={disabled} value={item.category} onChange={(event) => update(index, { category: event.target.value as ExtraCostCategory })} className={inputClass}>
            {COST_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
          <input disabled={disabled} value={item.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Наименование расхода" className={inputClass} />
          <input disabled={disabled} type="number" min="0" step="1" value={item.amount || ''} onChange={(event) => update(index, { amount: numberValue(event.target.value) })} placeholder="Сумма, ₸" className={`${inputClass} text-right`} />
          <button type="button" disabled={disabled} onClick={() => remove(index)} title="Удалить расход" className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {!disabled && <Button type="button" variant="ghost" size="sm" onClick={add} icon={<Plus className="h-4 w-4" />}>Добавить расход</Button>}
    </div>
  );
}

function FileUpload({ label, files, onUploaded, onRemove, disabled }: { label: string; files: MediaFile[]; onUploaded: (file: MediaFile) => void; onRemove: (file: MediaFile) => void; disabled: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file?: File) => {
    if (!file) return;
    if (!['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type) && !/\.(pdf|doc|docx)$/i.test(file.name)) {
      setError('Допустимы PDF, DOC и DOCX');
      return;
    }
    setUploading(true);
    setError('');
    try {
      onUploaded(await projectCalculationsApi.upload(file));
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {!disabled && (
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-emerald-400 hover:bg-emerald-50">
          <Paperclip className="h-4 w-4" />{uploading ? 'Загрузка...' : 'Прикрепить PDF, DOC или DOCX'}
          <input type="file" className="hidden" accept=".pdf,.doc,.docx" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} />
        </label>
      )}
      {files.length > 0 && <div className="mt-2 space-y-1">{files.map((file) => <div key={file.id} className="flex items-center gap-2"><a href={getMediaUrl(file.url)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm text-blue-700 hover:underline"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span></a>{!disabled && <button type="button" onClick={() => onRemove(file)} title="Убрать вложение" className="ml-auto text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>}</div>)}</div>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ProjectList({ context }: { context: ProjectCalculationContext }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState(context.canReview ? 'review' : 'mine');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await projectCalculationsApi.getAll({ scope, status: status || undefined, search: search || undefined, pageSize: 100 });
      setItems(response.data);
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось загрузить расчёты'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [scope, status]);

  const scopes = [
    { value: 'mine', label: 'Мои и с моим участием', visible: true },
    { value: 'review', label: 'На согласовании', visible: context.canReview },
    { value: 'department', label: 'Подразделение', visible: context.canViewDepartment },
    { value: 'all', label: 'Все расчёты', visible: context.isSuperAdmin || context.canReview },
  ].filter((item) => item.visible);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-800"><CircleDollarSign className="h-7 w-7 text-emerald-600" />Расчёт проектов</h1>
          <p className="mt-1 text-sm text-slate-500">Фактическая, ИИ и рыночная оценка проектов</p>
        </div>
        {context.canCreate && <Button onClick={() => navigate('/app/project-calculations/new')} icon={<Plus className="h-4 w-4" />}>Новый расчёт</Button>}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {scopes.map((item) => <button key={item.value} onClick={() => setScope(item.value)} className={`rounded-md px-3 py-2 text-sm font-medium ${scope === item.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px_44px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load()} placeholder="Номер, проект или заказчик" className={`${inputClass} pl-9`} /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">Все статусы</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button onClick={() => void load()} title="Обновить" className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? <Loader text="Загрузка расчётов..." /> : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center border-y border-slate-200 text-slate-400"><FolderOpen className="mb-3 h-10 w-10" /><p>Расчёты не найдены</p></div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3 font-medium">Номер</th><th className="px-4 py-3 font-medium">Проект</th><th className="px-4 py-3 font-medium">Подразделение</th><th className="px-4 py-3 text-right font-medium">Факт</th><th className="px-4 py-3 text-right font-medium">ИИ</th><th className="px-4 py-3 text-right font-medium">Рынок</th><th className="px-4 py-3 font-medium">Статус</th><th className="w-12" /></tr></thead>
            <tbody>{items.map((project) => (
              <tr key={project.id} onClick={() => navigate(`/app/project-calculations/${project.id}`)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-emerald-700">{project.requestNumber}</td>
                <td className="px-4 py-3"><div className="font-medium text-slate-800">{project.title}</div><div className="mt-0.5 text-xs text-slate-400">{project.customer || 'Заказчик не указан'}</div></td>
                <td className="px-4 py-3 text-slate-600">{project.department?.name_ru || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{money(project.actualTotal)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{money(project.aiTotal)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{money(project.marketAmount)}</td>
                <td className="px-4 py-3"><StatusBadge status={project.status} /></td>
                <td className="px-3"><ChevronRight className="h-4 w-4 text-slate-400" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectEditor({ context, projectId }: { context: ProjectCalculationContext; projectId?: number }) {
  const navigate = useNavigate();
  const isNew = !projectId;
  const [project, setProject] = useState<ProjectCalculation | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(context));
  const [aiFiles, setAiFiles] = useState<MediaFile[]>([]);
  const [marketFiles, setMarketFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const loadedRef = useRef(false);
  const saveSequence = useRef(0);

  const cacheKey = `project-calculation-draft:${projectId || 'new'}:${context.userId}`;
  const editable = isNew || Boolean(project && (context.isSuperAdmin || project.creator?.id === context.userId) && ['DRAFT', 'RETURNED'].includes(project.status));
  const selectedDepartmentId = Number(form.departmentId || context.department?.id || 0);
  const availableUsers = context.users.filter((user) => !selectedDepartmentId || Number(user.department?.id) === selectedDepartmentId);
  const selectedIds = new Set(form.team.map((member) => member.userId));
  const visibleUsers = availableUsers.filter((user) => !selectedIds.has(user.id) && `${userName(user)} ${user.email || ''}`.toLowerCase().includes(teamSearch.toLowerCase())).slice(0, 12);
  const selectedRate = context.departmentRates.find((item) => Number(item.departmentId) === selectedDepartmentId)?.hourlyRate ?? context.hourlyRate;
  const localTotals = totals(form, project ? numberValue(project.hourlyRate) : selectedRate);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const item = await projectCalculationsApi.getOne(projectId);
      setProject(item);
      setForm(projectToForm(item));
      setAiFiles(item.aiReportFiles || []);
      setMarketFiles(item.marketFiles || []);
      setSavedAt(item.autosavedAt || item.updatedAt);
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось загрузить расчёт'));
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  };

  useEffect(() => {
    if (isNew) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) try { setForm({ ...emptyForm(context), ...JSON.parse(cached) }); } catch { localStorage.removeItem(cacheKey); }
      loadedRef.current = true;
    } else void load();
  }, [projectId]);

  useEffect(() => {
    if (!loadedRef.current || !editable) return;
    localStorage.setItem(cacheKey, JSON.stringify(form));
    if (isNew) return;
    const sequence = ++saveSequence.current;
    const timer = window.setTimeout(async () => {
      try {
        const updated = await projectCalculationsApi.update(projectId!, form);
        if (sequence === saveSequence.current) {
          setProject(updated);
          setSavedAt(updated.autosavedAt || new Date().toISOString());
          setError('');
        }
      } catch (requestError: any) {
        if (sequence === saveSequence.current) setError(errorMessage(requestError, 'Автосохранение не выполнено'));
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [form, editable, isNew, projectId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = isNew ? await projectCalculationsApi.create(form) : await projectCalculationsApi.update(projectId!, form);
      localStorage.removeItem(cacheKey);
      setProject(saved);
      setForm(projectToForm(saved));
      setSavedAt(saved.autosavedAt || new Date().toISOString());
      setSuccess('Черновик сохранён');
      if (isNew) navigate(`/app/project-calculations/${saved.id}`, { replace: true });
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось сохранить расчёт'));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!project) return;
    setSaving(true);
    setError('');
    try {
      const saved = await projectCalculationsApi.update(project.id, form);
      const submitted = await projectCalculationsApi.submit(saved.id);
      setProject(submitted);
      setForm(projectToForm(submitted));
      localStorage.removeItem(cacheKey);
      setSuccess('Расчёт отправлен на согласование');
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось отправить расчёт'));
    } finally {
      setSaving(false);
    }
  };

  const performAction = async (action: 'start-review' | 'return' | 'approve' | 'reject' | 'reopen') => {
    if (!project) return;
    if (['return', 'reject'].includes(action) && !reviewComment.trim()) {
      setError('Для возврата и отклонения обязателен комментарий');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await projectCalculationsApi.action(project.id, action, reviewComment);
      setProject(updated);
      setForm(projectToForm(updated));
      setReviewComment('');
      setSuccess('Статус расчёта обновлён');
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'Не удалось изменить статус'));
    } finally {
      setSaving(false);
    }
  };

  const addTeamMember = (user: User) => set('team', [...form.team, { userId: user.id, role: '' }]);
  const updateTeamRole = (userId: number, role: string) => set('team', form.team.map((member) => member.userId === userId ? { ...member, role } : member));
  const removeTeamMember = (userId: number) => set('team', form.team.filter((member) => member.userId !== userId));
  const memberUser = (id: number) => context.users.find((user) => user.id === id) || project?.teamMembers?.find((user) => user.id === id);

  if (loading) return <Loader text="Загрузка расчёта..." />;
  if (!isNew && !project) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error || 'Расчёт не найден'}</div>;

  const rate = project ? numberValue(project.hourlyRate) : selectedRate;
  const shownActual = project && !editable ? numberValue(project.actualTotal) : localTotals.actual;
  const shownAi = project && !editable ? numberValue(project.aiTotal) : localTotals.ai;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app/project-calculations')} title="Назад к реестру" className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-slate-800">{isNew ? 'Новый расчёт проекта' : project?.requestNumber}</h1>{project && <StatusBadge status={project.status} />}</div><p className="mt-1 text-sm text-slate-500">{project?.department?.name_ru || context.department?.name_ru || 'Выберите подразделение'}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && <span className="mr-2 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{isNew ? 'Сохранено в браузере' : savedAt ? `Сохранено ${dateTime(savedAt)}` : 'Ожидает сохранения'}</span>}
          {editable && <Button variant="secondary" onClick={() => void save()} loading={saving} icon={<Save className="h-4 w-4" />}>Сохранить</Button>}
          {project && editable && <Button onClick={() => void submit()} loading={saving} icon={<Send className="h-4 w-4" />}>Отправить</Button>}
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}<button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button></div>}
      {project?.status === 'RETURNED' && project.reviewComment && <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"><strong>Комментарий согласующего:</strong> {project.reviewComment}</div>}

      <section className="border-y border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h2 className="mb-4 font-semibold text-slate-800">Проект</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Название" required><input disabled={!editable} value={form.title} onChange={(event) => set('title', event.target.value)} className={inputClass} /></Field>
          <Field label="Заказчик" required><input disabled={!editable} value={form.customer} onChange={(event) => set('customer', event.target.value)} className={inputClass} /></Field>
          {context.isSuperAdmin && isNew && <Field label="Подразделение" required><select disabled={!editable} value={form.departmentId || ''} onChange={(event) => { setForm((current) => ({ ...current, departmentId: Number(event.target.value), team: [] })); }} className={inputClass}><option value="">Выберите подразделение</option>{context.departments.map((department) => <option key={department.id} value={department.id}>{department.name_ru}</option>)}</select></Field>}
          <div className="grid grid-cols-2 gap-3"><Field label="Начало" required><input disabled={!editable} type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} className={inputClass} /></Field><Field label="Окончание" required><input disabled={!editable} type="date" value={form.endDate} onChange={(event) => set('endDate', event.target.value)} className={inputClass} /></Field></div>
          <div className="md:col-span-2"><Field label="Краткое описание"><textarea disabled={!editable} rows={3} value={form.description || ''} onChange={(event) => set('description', event.target.value)} className={inputClass} /></Field></div>
        </div>
      </section>

      <section className="bg-white px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-800">Команда проекта</h2><span className="text-sm text-slate-400">{form.team.length} чел.</span></div>
        {editable && <div className="relative mb-3 max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Найти сотрудника своего подразделения" className={`${inputClass} pl-9`} />{teamSearch && visibleUsers.length > 0 && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">{visibleUsers.map((user) => <button type="button" key={user.id} onClick={() => { addTeamMember(user); setTeamSearch(''); }} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"><UserPlus className="h-4 w-4 text-emerald-600" /><span><span className="block text-sm font-medium text-slate-700">{userName(user)}</span><span className="block text-xs text-slate-400">{user.position || user.email}</span></span></button>)}</div>}</div>}
        <div className="space-y-2">{form.team.map((member) => { const user = memberUser(member.userId); return <div key={member.userId} className="grid items-center gap-2 rounded-md border border-slate-200 px-3 py-2 sm:grid-cols-[1fr_280px_40px]"><div><div className="font-medium text-slate-700">{userName(user)}</div><div className="text-xs text-slate-400">{user?.position || user?.email}</div></div><input disabled={!editable} value={member.role} onChange={(event) => updateTeamRole(member.userId, event.target.value)} placeholder="Роль в проекте" className={inputClass} /><button type="button" disabled={!editable} onClick={() => removeTeamMember(member.userId)} title="Убрать из команды" className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>; })}</div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="border-t-4 border-emerald-500 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-emerald-600" /><h2 className="font-semibold text-slate-800">Фактическая оценка</h2></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Общие часы" required><input disabled={!editable} type="number" min="0" step="0.5" value={form.actualHours || ''} onChange={(event) => set('actualHours', numberValue(event.target.value))} className={`${inputClass} text-right`} /></Field><Field label="Стоимость часа"><input disabled value={rate || ''} className={`${inputClass} text-right`} /></Field></div>
          <div className="my-4 border-t border-slate-100 pt-4"><ExtraCostsEditor disabled={!editable} value={form.actualExtraCosts} onChange={(value) => set('actualExtraCosts', value)} /></div>
          <div className="flex items-end justify-between border-t border-slate-200 pt-4"><span className="text-sm text-slate-500">Итого без НДС, на руки</span><strong className="text-xl text-slate-900">{money(shownActual)}</strong></div>
        </section>

        <section className="border-t-4 border-blue-500 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Bot className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-800">Оценка по ИИ</h2></div>
          <Field label="Общие часы по оценке ИИ" required><input disabled={!editable} type="number" min="0" step="0.5" value={form.aiHours || ''} onChange={(event) => set('aiHours', numberValue(event.target.value))} className={`${inputClass} text-right`} /></Field>
          <div className="my-4 border-t border-slate-100 pt-4"><ExtraCostsEditor disabled={!editable} value={form.aiExtraCosts} onChange={(value) => set('aiExtraCosts', value)} /></div>
          <FileUpload disabled={!editable} label="Отчёт ИИ, необязательно" files={aiFiles} onUploaded={(file) => { setAiFiles((items) => [...items, file]); set('aiReportFileIds', [...form.aiReportFileIds, file.id]); }} onRemove={(file) => { setAiFiles((items) => items.filter((item) => item.id !== file.id)); set('aiReportFileIds', form.aiReportFileIds.filter((id) => id !== file.id)); }} />
          <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4"><span className="text-sm text-slate-500">Итого без НДС, на руки</span><strong className="text-xl text-slate-900">{money(shownAi)}</strong></div>
        </section>

        <section className="border-t-4 border-violet-500 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-violet-600" /><h2 className="font-semibold text-slate-800">Оценка по рынку</h2></div>
          <Field label="Средняя стоимость по рынку, ₸" required><input disabled={!editable} type="number" min="0" step="1" value={form.marketAmount || ''} onChange={(event) => set('marketAmount', numberValue(event.target.value))} className={`${inputClass} text-right`} /></Field>
          <div className="mt-4"><FileUpload disabled={!editable} label="Подтверждающий документ" files={marketFiles} onUploaded={(file) => { setMarketFiles((items) => [...items, file]); set('marketFileIds', [...form.marketFileIds, file.id]); }} onRemove={(file) => { setMarketFiles((items) => items.filter((item) => item.id !== file.id)); set('marketFileIds', form.marketFileIds.filter((id) => id !== file.id)); }} /></div>
          <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4"><span className="text-sm text-slate-500">Рыночная оценка</span><strong className="text-xl text-slate-900">{money(form.marketAmount)}</strong></div>
        </section>
      </div>

      {project && (
        <section className="border-y border-slate-200 bg-white px-4 py-5 sm:px-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800"><CircleDollarSign className="h-5 w-5 text-emerald-600" />Расчёт эффективности</h2>
          <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-md bg-emerald-50 p-4"><div className="text-sm text-emerald-700">По фактической оценке, на сотрудника</div><div className="mt-1 text-2xl font-bold text-emerald-900">{money(project.actualEfficiencyPerEmployee)}</div></div><div className="rounded-md bg-blue-50 p-4"><div className="text-sm text-blue-700">По оценке ИИ, на сотрудника</div><div className="mt-1 text-2xl font-bold text-blue-900">{money(project.aiEfficiencyPerEmployee)}</div></div></div>
        </section>
      )}

      {project && context.canReview && ['SUBMITTED', 'IN_REVIEW'].includes(project.status) && (
        <section className="border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 font-semibold text-slate-800">Решение согласующего</h2>
          <textarea rows={3} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Комментарий обязателен при возврате и отклонении" className={inputClass} />
          <div className="mt-3 flex flex-wrap gap-2">
            {project.status === 'SUBMITTED' && <Button variant="secondary" onClick={() => void performAction('start-review')} icon={<Clock3 className="h-4 w-4" />}>Взять на рассмотрение</Button>}
            <Button onClick={() => void performAction('approve')} icon={<Check className="h-4 w-4" />}>Одобрить</Button>
            <Button variant="secondary" onClick={() => void performAction('return')} icon={<RotateCcw className="h-4 w-4" />}>Вернуть</Button>
            <Button variant="danger" onClick={() => void performAction('reject')} icon={<XCircle className="h-4 w-4" />}>Отклонить</Button>
          </div>
        </section>
      )}

      {project && context.isSuperAdmin && ['APPROVED', 'REJECTED'].includes(project.status) && <section className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><LockKeyhole className="h-4 w-4" />Финальный расчёт заблокирован</div><Button variant="secondary" onClick={() => void performAction('reopen')} icon={<RotateCcw className="h-4 w-4" />}>Переоткрыть</Button></section>}

      {project && (project.versionHistory?.length || 0) > 0 && (
        <section className="bg-white px-4 py-5 sm:px-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800"><History className="h-5 w-5 text-blue-600" />Предыдущие версии</h2>
          <div className="overflow-x-auto border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Версия</th><th className="px-4 py-3">Отправлена</th><th className="px-4 py-3 text-right">Факт</th><th className="px-4 py-3 text-right">ИИ</th><th className="px-4 py-3 text-right">Рынок</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{[...(project.versionHistory || [])].reverse().map((version, index) => (
                <tr key={`${version.requestNumber || version.version}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{version.requestNumber || `Версия ${version.version || '—'}`}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateTime(version.submittedAt || version.snapshottedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{money(version.actualTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{money(version.aiTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{money(version.marketAmount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {project && (project.history?.length || 0) > 0 && <section className="bg-white px-4 py-5 sm:px-6"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800"><History className="h-5 w-5 text-slate-500" />История</h2><div className="space-y-0">{[...(project.history || [])].reverse().map((item, index) => <div key={`${item.at}-${index}`} className="grid gap-1 border-l-2 border-slate-200 py-3 pl-4 sm:grid-cols-[220px_1fr]"><div><div className="text-sm font-medium text-slate-700">{ACTION_LABELS[item.action] || item.action}</div><div className="text-xs text-slate-400">{dateTime(item.at)}</div></div><div className="text-sm text-slate-600">{item.actorName || 'Система'}{item.comment ? <p className="mt-1 text-slate-500">{item.comment}</p> : null}</div></div>)}</div></section>}
    </div>
  );
}

export default function ProjectCalculationsPage() {
  const params = useParams();
  const [context, setContext] = useState<ProjectCalculationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    projectCalculationsApi.getContext()
      .then(setContext)
      .catch((requestError) => setError(errorMessage(requestError, 'Не удалось проверить доступ к модулю')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader text="Загрузка модуля..." />;
  if (!context?.canAccess) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error || 'У вас нет доступа к расчёту проектов'}</div>;
  if (window.location.pathname.endsWith('/new') && !context.canCreate) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">Нет права создавать расчёты проектов</div>;
  const id = params.id ? Number(params.id) : undefined;
  return params.id || window.location.pathname.endsWith('/new') ? <ProjectEditor context={context} projectId={id} /> : <ProjectList context={context} />;
}
