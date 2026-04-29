import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, type Notification } from '../api/notifications';

const POLL_INTERVAL_MS = 30_000;

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = async () => {
    try {
      const c = await notificationsApi.unreadCount();
      setCount(c);
    } catch {
      // silent — auth may not be ready
    }
  };

  const refreshList = async () => {
    setLoading(true);
    try {
      const list = await notificationsApi.mine(false, 30);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) {
      refreshList();
      refreshCount();
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleItemClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationsApi.markRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
        );
        setCount((c) => Math.max(0, c - 1));
      } catch {}
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setCount(0);
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        aria-label="Уведомления"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[480px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-800">Уведомления</span>
            {count > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-primary-600 hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Прочитать все
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && (
              <div className="p-4 text-sm text-slate-400 text-center">Загрузка…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-6 text-sm text-slate-400 text-center">
                Нет уведомлений
              </div>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                    !n.isRead ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(n.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
          </div>

          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/app/notifications');
              }}
              className="w-full text-xs text-slate-600 hover:text-slate-900 text-center"
            >
              Все уведомления
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
