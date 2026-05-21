import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2 } from 'lucide-react';
import {
  protocolsApi,
  type Protocol,
  type ProtocolDepartmentUsers,
  type ProtocolTask,
} from '../api/protocolsClient';
import { useAuthStore } from '../../../store/authStore';

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
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<ProtocolDepartmentUsers[]>([]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);

  const [theme, setTheme] = useState('');
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [tasks, setTasks] = useState<ProtocolTask[]>([]);
  const [conclusion, setConclusion] = useState('');
  const [nextMeetingDate, setNextMeetingDate] = useState('');

  const [pickerDeptId, setPickerDeptId] = useState<number | ''>('');
  const [pickerUserId, setPickerUserId] = useState<number | ''>('');

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
      })
      .catch((e) =>
        setError(e?.response?.data?.error?.message || 'Не удалось загрузить протокол')
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

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
    if (!pickerDeptId) return [];
    const dept = departments.find((d) => d.id === pickerDeptId);
    return dept?.users || [];
  }, [pickerDeptId, departments]);

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
  }

  function addTask() {
    setTasks((prev) => [
      ...prev,
      { order: prev.length + 1, title: '', deadline: null, responsibleId: null, fact: '' },
    ]);
  }

  function updateTask(index: number, patch: Partial<ProtocolTask>) {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTask(index: number) {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(publishAfter = false) {
    if (!theme.trim()) {
      setError('Введите тему');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        theme: theme.trim(),
        meetingDate,
        attendees: attendees.map((a) => a.userId),
        tasks: tasks.map((t, idx) => ({
          order: idx + 1,
          title: t.title,
          deadline: t.deadline || null,
          responsibleId: t.responsibleId || null,
          fact: t.fact || null,
        })),
        conclusion: conclusion.trim() || null,
        nextMeetingDate: nextMeetingDate || null,
      };

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

      <h1 className="text-2xl font-semibold text-slate-800 mb-4">
        {isEdit ? 'Редактировать протокол' : 'Новый протокол'}
      </h1>

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

          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Отдел</label>
              <select
                value={pickerDeptId}
                onChange={(e) => {
                  setPickerDeptId(e.target.value ? Number(e.target.value) : '');
                  setPickerUserId('');
                }}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">Выберите отдел</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Сотрудник</label>
              <select
                value={pickerUserId}
                onChange={(e) => setPickerUserId(e.target.value ? Number(e.target.value) : '')}
                disabled={!pickerDeptId}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50"
              >
                <option value="">Выберите сотрудника</option>
                {pickerUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={addAttendee}
              disabled={!pickerUserId}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm"
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
            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 items-start bg-slate-50 p-2 rounded-lg"
                >
                  <div className="col-span-1 pt-2 text-sm font-medium text-slate-600">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    placeholder="Название задачи"
                    value={task.title || ''}
                    onChange={(e) => updateTask(index, { title: e.target.value })}
                    className="col-span-4 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    value={task.deadline || ''}
                    onChange={(e) => updateTask(index, { deadline: e.target.value || null })}
                    className="col-span-2 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <select
                    value={task.responsibleId || ''}
                    onChange={(e) =>
                      updateTask(index, {
                        responsibleId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="col-span-3 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="">Ответственный</option>
                    {departments.map((d) => (
                      <optgroup key={d.id} label={d.name}>
                        {d.users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="col-span-1">
                    <input
                      type="text"
                      placeholder="0%"
                      value={task.fact || ''}
                      onChange={(e) =>
                        updateTask(index, { fact: normalizeFactInput(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTask(index)}
                    className="col-span-1 p-2 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
