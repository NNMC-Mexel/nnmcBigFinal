import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Download,
  Edit3,
  History,
  Loader2,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { protocolsApi, type Protocol } from '../api/protocolsClient';
import { useAuthStore, useUserRole } from '../../../store/authStore';

const API_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:1337` : '');

function formatDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d?: string | null) {
  if (!d) return '';
  const date = new Date(d);
  return (
    date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
}

function userLabel(u: any) {
  return u?.fullName || u?.username || u?.email || `—`;
}

function pdfUrl(rawUrl: string): string {
  if (!rawUrl) return '#';
  if (rawUrl.startsWith('http')) return rawUrl;
  return `${API_URL}${rawUrl}`;
}

export default function ProtocolView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { isSuperAdmin } = useUserRole();

  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    protocolsApi
      .findOne(id)
      .then(setProtocol)
      .catch((e) => setError(e?.response?.data?.error?.message || 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !protocol) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link
          to="/app/protocols"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к списку
        </Link>
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mt-4">
          {error || 'Протокол не найден'}
        </div>
      </div>
    );
  }

  const isCreator = Number(protocol.creator?.id) === Number(user?.id);
  const isAttendee = (protocol.attendees || []).some((a) => Number(a.id) === Number(user?.id));
  const sameDept =
    user?.department?.id &&
    Number(protocol.creatorDepartment?.id) === Number(user.department.id);
  const canEdit = isCreator || isAttendee || sameDept || isSuperAdmin;
  const canPublish = protocol.status === 'draft' && (isCreator || isSuperAdmin);

  async function handlePublish() {
    if (!id) return;
    setActing(true);
    try {
      const updated = await protocolsApi.publish(id);
      setProtocol(updated);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Не удалось опубликовать');
    } finally {
      setActing(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    const ok = window.confirm('Удалить протокол безвозвратно?');
    if (!ok) return;
    setActing(true);
    try {
      await protocolsApi.remove(id);
      navigate('/app/protocols');
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Не удалось удалить');
    } finally {
      setActing(false);
    }
  }

  const pdfs = [...(protocol.pdfFiles || [])].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  const currentPdf = pdfs[0];

  // Build map of responsibles by id from protocol.responsibles + attendees
  const userMap = new Map<number, any>();
  for (const u of protocol.responsibles || []) userMap.set(u.id, u);
  for (const u of protocol.attendees || []) userMap.set(u.id, u);

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
        <div className="flex gap-2">
          {currentPdf && (
            <a
              href={pdfUrl(currentPdf.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-sm"
            >
              <Download className="w-4 h-4" />
              Скачать PDF
            </a>
          )}
          {canEdit && (
            <Link
              to={`/app/protocols/${protocol.id}/edit`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Редактировать
            </Link>
          )}
          {canPublish && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={acting}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Опубликовать
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={acting}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Удалить
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{protocol.theme}</h1>
            <div className="text-sm text-slate-500 mt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(protocol.meetingDate)}
              </span>
              <span>Отдел: {protocol.creatorDepartment?.name_ru || '—'}</span>
              <span>Подготовил: {userLabel(protocol.creator)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {protocol.status === 'published' ? (
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700 border border-green-200">
                Опубликован
              </span>
            ) : (
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Черновик
              </span>
            )}
            <span className="text-xs text-slate-500">v{protocol.version}</span>
          </div>
        </div>

        {/* Attendees */}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Присутствовали ({(protocol.attendees || []).length})
          </div>
          {protocol.attendees && protocol.attendees.length > 0 ? (
            <ul className="text-sm text-slate-600 space-y-1">
              {protocol.attendees.map((u) => (
                <li key={u.id}>• {userLabel(u)}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-400">—</div>
          )}
        </div>

        {/* Tasks */}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Задачи</div>
          {protocol.tasks && protocol.tasks.length > 0 ? (
            <div className="overflow-hidden border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left p-2 w-10">№</th>
                    <th className="text-left p-2">Название</th>
                    <th className="text-left p-2 w-28">Срок</th>
                    <th className="text-left p-2 w-48">Ответственный</th>
                    <th className="text-left p-2 w-20">Факт</th>
                  </tr>
                </thead>
                <tbody>
                  {protocol.tasks.map((t, i) => {
                    const respUser = t.responsibleId ? userMap.get(t.responsibleId) : null;
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 text-slate-500">{i + 1}</td>
                        <td className="p-2 text-slate-700">{t.title}</td>
                        <td className="p-2 text-slate-600">{formatDate(t.deadline)}</td>
                        <td className="p-2 text-slate-600">
                          {respUser ? userLabel(respUser) : t.responsibleId ? `User #${t.responsibleId}` : '—'}
                        </td>
                        <td className="p-2 text-slate-600">{t.fact || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-400">—</div>
          )}
        </div>

        {protocol.conclusion && (
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Заключение</div>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{protocol.conclusion}</div>
          </div>
        )}

        {protocol.nextMeetingDate && (
          <div className="text-sm">
            <span className="font-medium text-slate-700">Следующее совещание:</span>{' '}
            <span className="text-slate-600">{formatDate(protocol.nextMeetingDate)}</span>
          </div>
        )}
      </div>

      {/* PDF versions */}
      {pdfs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mt-4">
          <div className="text-sm font-medium text-slate-700 mb-3">Версии PDF</div>
          <ul className="space-y-2">
            {pdfs.map((file, i) => (
              <li key={file.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-slate-700">
                    v{pdfs.length - i}
                    {i === 0 && (
                      <span className="ml-2 text-xs text-green-600">(актуальная)</span>
                    )}
                  </span>
                  <span className="ml-3 text-slate-500 text-xs">
                    {formatDateTime(file.createdAt)}
                  </span>
                </div>
                <a
                  href={pdfUrl(file.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                >
                  <Download className="w-4 h-4" />
                  Скачать
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* History */}
      {protocol.history && protocol.history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mt-4">
          <div className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1">
            <History className="w-4 h-4" />
            История изменений
          </div>
          <ul className="space-y-2 text-sm">
            {[...protocol.history]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-slate-400 text-xs whitespace-nowrap">
                    {formatDateTime(h.timestamp)}
                  </span>
                  <span className="text-slate-700">
                    <span className="font-medium">{h.userName}</span>
                    <span className="text-slate-500">
                      {' '}
                      — {h.action === 'created' && 'создал черновик'}
                      {h.action === 'published' && 'опубликовал'}
                      {h.action === 'edited' && `редактировал (${h.summary})`}
                      {h.version ? ` → v${h.version}` : ''}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
