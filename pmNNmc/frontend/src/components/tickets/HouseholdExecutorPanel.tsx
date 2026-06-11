import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import type { HouseholdExecutor, Ticket } from '../../types';
import ComboboxSelect, { type ComboboxOption } from '../ui/ComboboxSelect';

interface Props {
  ticket: Ticket;
  canManage: boolean;
  onTicketUpdated: (ticket: Ticket) => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as any)?.response?.data?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export default function HouseholdExecutorPanel({ ticket, canManage, onTicketUpdated }: Props) {
  const [executors, setExecutors] = useState<HouseholdExecutor[]>([]);
  const [newExecutorName, setNewExecutorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedExecutorId = ticket.householdExecutor?.id ? String(ticket.householdExecutor.id) : '';

  const loadExecutors = async () => {
    if (!canManage) return;
    setLoading(true);
    setError('');
    try {
      const items = await ticketsApi.getHouseholdExecutors();
      setExecutors(items);
    } catch {
      setError('Не удалось загрузить исполнителей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExecutors();
  }, [canManage]);

  const options: ComboboxOption[] = useMemo(
    () => {
      const selectedIsMissing = ticket.householdExecutor?.id
        ? !executors.some((executor) => executor.id === ticket.householdExecutor?.id)
        : false;
      return [
        { value: '', label: 'Не назначен' },
        ...(selectedIsMissing && ticket.householdExecutor
          ? [{
              value: String(ticket.householdExecutor.id),
              label: `${ticket.householdExecutor.name} (удален из списка)`,
            }]
          : []),
        ...executors.map((executor) => ({
          value: String(executor.id),
          label: executor.name,
        })),
      ];
    },
    [executors, ticket.householdExecutor]
  );

  const assignExecutor = async (executorId: string) => {
    if (!canManage || saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await ticketsApi.assignHouseholdExecutor(
        ticket.documentId,
        executorId ? Number(executorId) : null
      );
      onTicketUpdated(updated);
    } catch (error) {
      setError(getApiErrorMessage(error, 'Не удалось назначить исполнителя'));
    } finally {
      setSaving(false);
    }
  };

  const addExecutor = async () => {
    const name = newExecutorName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await ticketsApi.createHouseholdExecutor(name);
      setExecutors((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setNewExecutorName('');
      const updated = await ticketsApi.assignHouseholdExecutor(ticket.documentId, created.id);
      onTicketUpdated(updated);
    } catch (error) {
      setError(getApiErrorMessage(error, 'Не удалось добавить исполнителя'));
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedExecutor = async () => {
    const executorId = Number(selectedExecutorId);
    if (!canManage || !executorId || saving) return;
    const executor = executors.find((item) => item.id === executorId) || ticket.householdExecutor;
    if (!window.confirm(`Удалить исполнителя "${executor?.name || ''}" из списка?`)) return;

    setSaving(true);
    setError('');
    try {
      await ticketsApi.deleteHouseholdExecutor(executorId);
      setExecutors((items) => items.filter((item) => item.id !== executorId));
    } catch (error) {
      setError(getApiErrorMessage(error, 'Не удалось удалить исполнителя'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Исполнитель хозслужбы</h3>
        {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {!canManage ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
            <UserRound className="h-5 w-5" />
          </div>
          <p className="min-w-0 break-words text-sm font-medium text-slate-800">
            {ticket.householdExecutor?.name || 'Не назначен'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <ComboboxSelect
            value={selectedExecutorId}
            onChange={assignExecutor}
            options={options}
            searchable={executors.length > 6}
            searchPlaceholder="Поиск исполнителя..."
            emptyText="Исполнители не найдены"
          />

          <div className="flex min-w-0 gap-2">
            <input
              value={newExecutorName}
              onChange={(event) => setNewExecutorName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addExecutor();
                }
              }}
              placeholder="Новое имя"
              disabled={saving}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={addExecutor}
              disabled={!newExecutorName.trim() || saving}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Добавить исполнителя"
              aria-label="Добавить исполнителя"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {selectedExecutorId && (
            <button
              type="button"
              onClick={deleteSelectedExecutor}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Удалить из списка
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {ticket.householdExecutor && ticket.status !== 'DONE' && (
        <p className="mt-3 text-xs text-slate-500">
          После выполнения менеджер закрывает заявку статусом "Выполнено".
        </p>
      )}
    </div>
  );
}
