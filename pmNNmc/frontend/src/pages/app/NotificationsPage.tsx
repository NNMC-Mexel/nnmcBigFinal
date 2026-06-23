import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { notificationsApi, type Notification } from '../../api/notifications';
import { subscribeToNotificationRealtime } from '../../api/notificationRealtime';

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const list = await notificationsApi.mine(unreadOnly, 200);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [unreadOnly]);

  useEffect(() => {
    return subscribeToNotificationRealtime(() => {
      load();
    });
  }, [unreadOnly]);

  const handleItemClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationsApi.markRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
        );
      } catch {}
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      setItems((prev) =>
        unreadOnly ? [] : prev.map((x) => ({ ...x, isRead: true }))
      );
      await load();
    } catch {
      await load();
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter((x) => !x.isRead).length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary-600" />
          Уведомления
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            className="px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg flex items-center gap-2"
          >
            <CheckCheck className="w-4 h-4" />
            Прочитать все
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            !unreadOnly
              ? 'bg-primary-100 text-primary-700 font-medium'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            unreadOnly
              ? 'bg-primary-100 text-primary-700 font-medium'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Непрочитанные
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-slate-400">Загрузка…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Нет уведомлений</p>
          </div>
        )}
        {!loading &&
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleItemClick(n)}
              className={`w-full text-left px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                !n.isRead ? 'bg-blue-50/40' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {!n.isRead ? (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{n.title}</p>
                  {n.body && (
                    <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(n.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
