import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2 } from 'lucide-react';
import {
  protocolsApi,
  type Protocol,
  type ProtocolDepartmentUsers,
  type ProtocolTask,
} from '../api/protocolsClient';
import { useAuthStore } from '../../../store/authStore';
import ComboboxSelect, { type ComboboxOption } from '../../../components/ui/ComboboxSelect';

type Attendee = {
  userId: number;
  fullName: string;
  departmentName: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function userLabel(u: { fullName?: string | null; username?: string | null; email?: string | null }) {
  return u.fullName || u.username || u.email || '';
}

function normalizeFactInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '').slice(0, 3);
  if (!digits) return '';
  const num = Math.min(100, Number(digits));
  return `${num}%`;
}

export default function ProtocolForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<ProtocolDepartmentUsers[]>([]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);

  const [theme, setTheme] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [tasks, setTasks] = useState<ProtocolTask[]>([]);
  const [conclusion, setConclusion] = useState('');
  const [nextMeetingDate, setNextMeetingDate] = useState('');

  const [pickerDeptId, setPickerDeptId] = useState('');
  const [pickerUserId, setPickerUserId] = useState('');
  const lastServerSnapshot = useRef('');
  const restoredEditDraft = useRef(false);

  useEffect(() => {
    protocolsApi.usersByDepartment().then(setDepartments).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    setLoading(true);
    protocolsApi
      .findOne(id)
      .then((p) => {
        setProtocol(p);
        setTheme(p.theme || '');
        setMeetingDate(p.meetingDate || todayIso());
        setAttendees(
          (p.attendees || []).map((u: any) => ({
            userId: u.id,
            fullName: userLabel(u),
            departmentName: u.department?.name_ru || '',
          }))
        );
        setTasks(p.tasks || []);
        setConclusion(p.conclusion || '');
        setNextMeetingDate(p.nextMeetingDate || '');
        lastServerSnapshot.current = JSON.stringify({
          theme: p.theme || '',
          meetingDate: p.meetingDate || todayIso(),
          attendees: (p.attendees || []).map((attendee) => attendee.id),
          tasks: (p.tasks || []).map((task, index) => ({
            order: index + 1,
            title: task.title || '',
            shortDescription: task.shortDescription || null,
            description: task.description || null,
            deadline: task.deadline || null,
            responsibleId: task.responsibleId || null,
            fact: task.fact || null,
          })),
          conclusion: p.conclusion || null,
          nextMeetingDate: p.nextMeetingDate || null,
        });
        setFormReady(true);
      })
      .catch((e) =>
        setError(e?.response?.data?.error?.message || 'Не удалось загрузить протокол')
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const draftStorageKey = useMemo(
    () => `nnmc-protocol-draft:${id || 'new'}:${user?.id || 'anonymous'}`,
    [id, user?.id]
  );

  useEffect(() => {
    if (isEdit) return;
    try {
      const stored = window.localStorage.getItem(draftStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setTheme(parsed.theme || '');
        setMeetingDate(parsed.meetingDate || todayIso());
        setAttendees(Array.isArray(parsed.attendees) ? parsed.attendees : []);
        setTasks(Array.isArray(parsed.tasks) ? parsed.tasks : []);
        setConclusion(parsed.conclusion || '');
        setNextMeetingDate(parsed.nextMeetingDate || '');
        setDraftStatus('Черновик восстановлен');
      }
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setFormReady(true);
    }
  }, [draftStorageKey, isEdit]);

  useEffect(() => {
    if (!isEdit || !formReady || !protocol || restoredEditDraft.current) return;
    restoredEditDraft.current = true;
    try {
      const stored = window.localStorage.getItem(draftStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const localSavedAt = new Date(parsed.savedAt || 0).getTime();
      const serverSavedAt = new Date(protocol.updatedAt || 0).getTime();
      if (!Number.isFinite(localSavedAt) || localSavedAt <= serverSavedAt) return;
      setTheme(parsed.theme || '');
      setMeetingDate(parsed.meetingDate || todayIso());
      setAttendees(Array.isArray(parsed.attendees) ? parsed.attendees : []);
      setTasks(Array.isArray(parsed.tasks) ? parsed.tasks : []);
      setConclusion(parsed.conclusion || '');
      setNextMeetingDate(parsed.nextMeetingDate || '');
      setDraftStatus('Восстановлены последние несохраненные изменения');
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, formReady, isEdit, protocol]);

  const allUsersFlat = useMemo(() => {
    const map = new Map<number, { userId: number; fullName: string; departmentName: string }>();
    for (const d of departments) {
      for (const u of d.users) {
        map.set(u.id, {
          userId: u.id,
          fullName: userLabel(u),
          departmentName: d.name,
        });
      }
    }
    return map;
  }, [departments]);

  const pickerUsers = useMemo(() => {
    if (!pickerDeptId) return Array.from(allUsersFlat.values());
    const dept = departments.find((d) => String(d.id) === pickerDeptId);
    return (dept?.users || []).map((entry) => ({
      userId: entry.id,
      fullName: userLabel(entry),
      departmentName: dept?.name || '',
    }));
  }, [allUsersFlat, pickerDeptId, departments]);

  const departmentOptions = useMemo<ComboboxOption[]>(
    () => departments.map((department) => ({ value: String(department.id), label: department.name })),
    [departments]
  );

  const pickerUserOptions = useMemo<ComboboxOption[]>(
    () => pickerUsers
      .filter((entry) => !attendees.some((attendee) => attendee.userId === entry.userId))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru'))
      .map((entry) => ({
        value: String(entry.userId),
        label: entry.fullName,
        description: entry.departmentName,
      })),
    [attendees, pickerUsers]
  );

  const responsibleOptions = useMemo<ComboboxOption[]>(
    () => attendees.map((attendee) => ({
      value: String(attendee.userId),
      label: attendee.fullName,
      description: attendee.departmentName,
    })),
    [attendees]
  );

  const myDeptName = user?.department?.name_ru || (user?.department as any)?.name || '';

  function addAttendee() {
    if (!pickerUserId) return;
    const userId = Number(pickerUserId);
    if (attendees.some((a) => a.userId === userId)) return;
    const info = allUsersFlat.get(userId);
    if (!info) return;
    setAttendees((prev) => [...prev, info]);
    setPickerUserId('');
  }

  function removeAttendee(userId: number) {
    setAttendees((prev) => prev.filter((a) => a.userId !== userId));
    setTasks((prev) => prev.map((task) =>
      Number(task.responsibleId) === userId ? { ...task, responsibleId: null } : task
    ));
  }

  function addTask() {
    setTasks((prev) => [
      ...prev,
      {
        order: prev.length + 1,
        title: '',
        shortDescription: '',
        description: '',
        deadline: null,
        responsibleId: null,
        fact: '',
      },
    ]);
  }

  function updateTask(index: number, patch: Partial<ProtocolTask>) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTask(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }

  const buildPayload = useCallback(() => ({
    theme: theme.trim(),
    meetingDate,
    attendees: attendees.map((attendee) => attendee.userId),
    tasks: tasks.map((task, index) => ({
      order: index + 1,
      title: task.title,
      shortDescription: task.shortDescription?.trim() || null,
      description: task.description?.trim() || null,
      deadline: task.deadline || null,
      responsibleId: task.responsibleId || null,
      fact: task.fact || null,
    })),
    conclusion: conclusion.trim() || null,
    nextMeetingDate: nextMeetingDate || null,
  }), [attendees, conclusion, meetingDate, nextMeetingDate, tasks, theme]);

  useEffect(() => {
    if (!formReady) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftStorageKey, JSON.stringify({
        theme,
        meetingDate,
        attendees,
        tasks,
        conclusion,
        nextMeetingDate,
        savedAt: new Date().toISOString(),
      }));
      setDraftStatus(isEdit && protocol?.status === 'draft' ? 'Черновик сохранен локально' : 'Черновик сохранен');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [attendees, conclusion, draftStorageKey, formReady, isEdit, meetingDate, nextMeetingDate, protocol?.status, tasks, theme]);

  useEffect(() => {
    if (!formReady || !isEdit || !id || protocol?.status !== 'draft' || !theme.trim() || saving || publishing) return;
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastServerSnapshot.current) return;
    const timer = window.setTimeout(async () => {
      setDraftStatus('Сохраняем черновик...');
      try {
        await protocolsApi.update(id, { ...payload, autosave: true });
        lastServerSnapshot.current = snapshot;
        setDraftStatus('Черновик сохранен на сервере');
      } catch {
        setDraftStatus('Черновик сохранен локально');
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [buildPayload, formReady, id, isEdit, protocol?.status, publishing, saving, theme]);

  async function handleSave(publishAfter = false) {
    if (!theme.trim()) {
      setError('Введите тему');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = buildPayload();

      let target: Protocol;
      if (isEdit && id) {
        if (protocol?.status === 'published') {
          const ok = window.confirm(
            'Вы внесли изменения. При сохранении будет создана новая версия PDF. Продолжить?'
          );
          if (!ok) {
            setSaving(false);
            return;
          }
        }
        const result = await protocolsApi.update(id, payload);
        target = result.data;
      } else {
        target = await protocolsApi.create(payload);
      }

      if (publishAfter && target.status !== 'published') {
        setPublishing(true);
        await protocolsApi.publish(target.id);
      }

      window.localStorage.removeItem(draftStorageKey);
      navigate(`/app/protocols/${target.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link
          to="/app/protocols"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к списку
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">
          {isEdit ? 'Редактировать протокол' : 'Новый протокол'}
        </h1>
        {draftStatus && <span className="text-xs text-slate-500">{draftStatus}</span>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Отдел</label>
            <input
              value={myDeptName || ''}
              readOnly
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Дата совещания</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Тема *</label>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="О чём совещание"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Протокол подготовил</label>
          <div className="text-sm text-slate-700">{user?.fullName || user?.username}</div>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Присутствовали</label>
          {attendees.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {attendees.map((a) => (
                <li
                  key={a.userId}
                  className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg text-sm"
                >
                  <span>
                    {a.fullName}{' '}
                    <span className="text-slate-400 text-xs">— {a.departmentName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttendee(a.userId)}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-400 mb-3">Пока никого не добавили</div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.2fr)_auto] sm:items-end">
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 mb-1">Отдел</label>
              <ComboboxSelect
                value={pickerDeptId}
                onChange={(value) => {
                  setPickerDeptId(value);
                  setPickerUserId('');
                }}
                options={departmentOptions}
                placeholder="Все отделы"
                searchPlaceholder="Поиск отдела..."
                searchable
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 mb-1">Сотрудник</label>
              <ComboboxSelect
                value={pickerUserId}
                onChange={setPickerUserId}
                options={pickerUserOptions}
                placeholder="Найдите сотрудника"
                searchPlaceholder="ФИО, логин или отдел..."
                emptyText="Сотрудник не найден"
                searchable
              />
            </div>
            <button
              type="button"
              onClick={addAttendee}
              disabled={!pickerUserId}
              className="inline-flex h-12 items-center justify-center gap-1 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>
        </div>

        {/* Tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">Задачи</label>
            <button
              type="button"
              onClick={addTask}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Добавить задачу
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-400">Пока задач нет</div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Задача {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      className="p-2 text-slate-400 hover:text-red-600"
                      title="Удалить задачу"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-600">Название *</span>
                      <input
                        type="text"
                        placeholder="Название задачи"
                        value={task.title || ''}
                        onChange={(e) => updateTask(index, { title: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-600">Краткое описание задачи</span>
                      <input
                        type="text"
                        placeholder="Суть задачи в одной строке"
                        value={task.shortDescription || ''}
                        onChange={(e) => updateTask(index, { shortDescription: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 lg:col-span-2">
                      <span className="block text-xs font-medium text-slate-600">Описание задачи</span>
                      <textarea
                        rows={3}
                        placeholder="Подробно опишите результат и условия выполнения"
                        value={task.description || ''}
                        onChange={(e) => updateTask(index, { description: e.target.value })}
                        className="w-full resize-y border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-600">Срок</span>
                      <input
                        type="date"
                        value={task.deadline || ''}
                        onChange={(e) => updateTask(index, { deadline: e.target.value || null })}
                        className="w-full h-12 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="min-w-0 space-y-1">
                      <span className="block text-xs font-medium text-slate-600">Ответственный из присутствующих</span>
                      <ComboboxSelect
                        value={task.responsibleId ? String(task.responsibleId) : ''}
                        onChange={(value) => updateTask(index, { responsibleId: value ? Number(value) : null })}
                        options={responsibleOptions}
                        placeholder={attendees.length ? 'Найдите ответственного' : 'Сначала добавьте присутствующих'}
                        searchPlaceholder="Поиск по ФИО..."
                        emptyText="Нет доступных присутствующих"
                        disabled={attendees.length === 0}
                        searchable
                      />
                    </div>
                    <label className="space-y-1 sm:max-w-40">
                      <span className="block text-xs font-medium text-slate-600">Факт выполнения</span>
                    <input
                      type="text"
                      placeholder="0%"
                      value={task.fact || ''}
                      onChange={(e) =>
                        updateTask(index, { fact: normalizeFactInput(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Заключение (опционально)
          </label>
          <textarea
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Дата следующего совещания (опционально)
            </label>
            <input
              type="date"
              value={nextMeetingDate}
              onChange={(e) => setNextMeetingDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            to={isEdit ? `/app/protocols/${id}` : '/app/protocols'}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Отмена
          </Link>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving || publishing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm disabled:opacity-50"
          >
            {saving && !publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
            {!isEdit && ' черновик'}
          </button>
          {(!isEdit || protocol?.status === 'draft') && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || publishing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Опубликовать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
