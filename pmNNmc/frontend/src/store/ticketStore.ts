import { create } from 'zustand';
import type { Ticket, AssignableUser } from '../types';
import { ticketsApi, type ReassignTicketPayload, type TicketFilters } from '../api/tickets';

interface TicketState {
  tickets: Ticket[];
  total: number;
  selectedTicket: Ticket | null;
  assignableUsers: AssignableUser[];
  filters: TicketFilters;
  isLoading: boolean;
  error: string | null;

  fetchTickets: (filters?: TicketFilters) => Promise<void>;
  fetchTicket: (documentId: string) => Promise<void>;
  updateTicket: (documentId: string, data: Partial<Ticket>) => Promise<void>;
  deleteTicket: (documentId: string) => Promise<void>;
  reassignTicket: (documentId: string, payload: ReassignTicketPayload) => Promise<Ticket>;
  fetchAssignableUsers: () => Promise<void>;
  setFilters: (filters: Partial<TicketFilters>) => void;
  clearFilters: () => void;
  clearSelectedTicket: () => void;
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  total: 0,
  selectedTicket: null,
  assignableUsers: [],
  filters: {},
  isLoading: false,
  error: null,

  fetchTickets: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const appliedFilters = filters || get().filters;
      const result = await ticketsApi.getAll(appliedFilters);
      set({ tickets: result.data, total: result.total, isLoading: false });
    } catch {
      set({ error: 'Ошибка загрузки заявок', isLoading: false });
    }
  },

  fetchTicket: async (documentId) => {
    set({ isLoading: true, error: null });
    try {
      const ticket = await ticketsApi.getOne(documentId);
      set({ selectedTicket: ticket, isLoading: false });
    } catch {
      set({ error: 'Ошибка загрузки заявки', isLoading: false });
    }
  },

  updateTicket: async (documentId, data) => {
    set({ error: null });
    try {
      const updated = await ticketsApi.update(documentId, data);
      set({ selectedTicket: updated });
      await get().fetchTickets();
    } catch (error) {
      set({ error: 'Ошибка обновления заявки' });
      throw error;
    }
  },

  deleteTicket: async (documentId) => {
    set({ error: null });
    try {
      await ticketsApi.delete(documentId);
      set((state) => ({
        tickets: state.tickets.filter((ticket) => ticket.documentId !== documentId),
        selectedTicket: state.selectedTicket?.documentId === documentId ? null : state.selectedTicket,
        total: Math.max(0, state.total - 1),
      }));
    } catch (error) {
      set({ error: 'Ошибка удаления заявки' });
      throw error;
    }
  },

  reassignTicket: async (documentId, payload) => {
    set({ error: null });
    try {
      const updated = await ticketsApi.reassign(documentId, payload);
      set({ selectedTicket: updated });
      await get().fetchTickets();
      return updated;
    } catch {
      set({ error: 'Ошибка переназначения заявки' });
      throw new Error('Ошибка переназначения заявки');
    }
  },

  fetchAssignableUsers: async () => {
    try {
      const users = await ticketsApi.getAssignableUsers();
      set({ assignableUsers: users });
    } catch {
      console.error('Failed to fetch assignable users');
    }
  },

  setFilters: (filters) => {
    const newFilters = { ...get().filters, ...filters };
    set({ filters: newFilters });
  },

  clearFilters: () => set({ filters: {} }),

  clearSelectedTicket: () => set({ selectedTicket: null }),
}));
