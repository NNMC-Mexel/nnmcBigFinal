import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import type { HouseholdExecutor, Ticket } from '../../types';
import ComboboxSelect, { type ComboboxOption } from '../ui/ComboboxSelect';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

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
  const [executorToDelete, setExecutorToDelete] = useState<HouseholdExecutor | null>(null);

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

  const openDeleteExecutorDialog = (executor: HouseholdExecutor) => {
    if (!canManage || saving) return;
    setError('');
    setExecutorToDelete(executor);
  };

  const closeDeleteExecutorDialog = () => {
    if (saving) return;
    setExecutorToDelete(null);
  };

  const confirmDeleteExecutor = async () => {
    if (!canManage || !executorToDelete || saving) return;
    const executorId = Number(executorToDelete.id);
    if (!executorId) return;

    setSaving(true);
    setError('');
    try {
      await ticketsApi.deleteHouseholdExecutor(executorId);
      setExecutors((items) => items.filter((item) => item.id !== executorId));
      setExecutorToDelete(null);
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Пул исполнителей
              </p>
              <span className="text-xs text-slate-400">{executors.length}</span>
            </div>

            {executors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
                Список исполнителей пуст
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {executors.map((executor) => {
                  const isAssigned = Number(ticket.householdExecutor?.id) === Number(executor.id);

                  return (
                    <div
                      key={executor.id}
                      className="flex min-w-0 items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{executor.name}</p>
                        {isAssigned && (
                          <p className="text-xs text-cyan-700">Назначен в этой заявке</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openDeleteExecutorDialog(executor)}
                        disabled={saving}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Удалить из пула"
                        aria-label={`Удалить ${executor.name} из пула`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedExecutorId && !executors.some((executor) => String(executor.id) === selectedExecutorId) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Текущий исполнитель удален из пула. Выберите другого исполнителя или оставьте заявку без назначения.
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {ticket.householdExecutor && ticket.status !== 'DONE' && (
        <p className="mt-3 text-xs text-slate-500">
          После выполнения менеджер закрывает заявку статусом "Выполнено".
        </p>
      )}

      <Modal
        isOpen={Boolean(executorToDelete)}
        onClose={closeDeleteExecutorDialog}
        title="Удалить исполнителя"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-slate-800">
                Удалить "{executorToDelete?.name}" из пула исполнителей?
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {Number(ticket.householdExecutor?.id) === Number(executorToDelete?.id)
                  ? 'Исполнитель будет скрыт из списка для новых назначений, но останется в этой заявке.'
                  : 'Исполнитель будет скрыт из списка для новых назначений.'}
              </p>
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDeleteExecutorDialog}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmDeleteExecutor}
              loading={saving}
              className="w-full sm:w-auto"
            >
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
