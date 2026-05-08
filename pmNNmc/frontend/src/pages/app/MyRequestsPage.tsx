import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, RefreshCw, Send } from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import { subscribeToNotificationRealtime } from '../../api/notificationRealtime';
import TicketStatusBadge from '../../components/tickets/TicketStatusBadge';
import Loader from '../../components/ui/Loader';
import type { Ticket } from '../../types';

export default function MyRequestsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setError(null);
    try {
      const result = await ticketsApi.getMyRequests({ page: 1, pageSize: 100 });
      setTickets(result.data);
    } catch {
      setError('Не удалось загрузить ваши запросы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    return subscribeToNotificationRealtime((payload) => {
      if (!payload.type?.startsWith('tickets:')) return;
      loadTickets();
    });
  }, [loadTickets]);

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryName = (ticket: Ticket) => ticket.category?.name_ru || ticket.category?.name_kz || '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">HelpDesk</h1>
            <p className="text-sm text-slate-500">Статусы заявок, которые вы отправили в службу поддержки</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTickets}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Обновить"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/helpdesk/submit')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Подать заявку
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading && <Loader />}

      {!loading && tickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-500">
          <ClipboardList className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p>У вас пока нет запросов</p>
        </div>
      ) : null}

      {!loading && tickets.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">№</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Категория</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Комментарий IT</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Создано</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Выполнено</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/app/helpdesk/${ticket.documentId}`)}
                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-cyan-600">{ticket.ticketNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{getCategoryName(ticket)}</td>
                    <td className="px-4 py-3">
                      <TicketStatusBadge status={ticket.status} />
                    </td>
                    <td className="max-w-sm px-4 py-3 text-slate-600">
                      <span className="line-clamp-2">{ticket.staffComment || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(ticket.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(ticket.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
