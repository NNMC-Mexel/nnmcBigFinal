import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Calendar, Users, Loader2 } from 'lucide-react';
import { protocolsApi, type Protocol, type ProtocolFilter } from '../api/protocolsClient';
import { useUserRole } from '../../../store/authStore';

function formatDate(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TABS: Array<{ key: ProtocolFilter; label: string; superAdminOnly?: boolean }> = [
  { key: 'mine', label: 'Мои протоколы' },
  { key: 'with-me', label: 'Со мной' },
  { key: 'department', label: 'Отдел' },
  { key: 'all', label: 'Все', superAdminOnly: true },
];

export default function ProtocolsList() {
  const { isSuperAdmin } = useUserRole();
  const [filter, setFilter] = useState<ProtocolFilter>('mine');
  const [items, setItems] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.superAdminOnly || isSuperAdmin),
    [isSuperAdmin]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    protocolsApi
      .list(filter)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e?.response?.data?.error?.message || 'Не удалось загрузить протоколы');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-600" />
          Протоколы
        </h1>
        <Link
          to="/app/protocols/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Новый протокол
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2 ${
              filter === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          Протоколов пока нет
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Тема</th>
                <th className="text-left p-3">Дата</th>
                <th className="text-left p-3">Автор</th>
                <th className="text-left p-3">Отдел</th>
                <th className="text-left p-3">Присутствовало</th>
                <th className="text-left p-3">Версия</th>
                <th className="text-left p-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="p-3">
                    <Link to={`/app/protocols/${p.id}`} className="text-indigo-600 hover:underline font-medium">
                      {p.theme}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(p.meetingDate)}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600">
                    {p.creator?.fullName || p.creator?.username || '—'}
                  </td>
                  <td className="p-3 text-slate-600">{p.creatorDepartment?.name_ru || '—'}</td>
                  <td className="p-3 text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {(p.attendees || []).length}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600">v{p.version}</td>
                  <td className="p-3">
                    {p.status === 'published' ? (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700 border border-green-200">
                        Опубликован
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Черновик
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
