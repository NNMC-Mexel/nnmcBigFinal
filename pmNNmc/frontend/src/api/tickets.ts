import client from './client';
import type { Ticket, ServiceGroup, AssignableUser } from '../types';

export interface TicketFilters {
  status?: string;
  search?: string;
  categoryId?: number;
  assigneeId?: number;
  myTickets?: boolean;
  page?: number;
  pageSize?: number;
}

// Authenticated API
export const ticketsApi = {
  getAll: async (filters?: TicketFilters): Promise<{ data: Ticket[]; total: number }> => {
    // Use custom /tickets/list endpoint to bypass Strapi's strict query validation
    const params: Record<string, any> = {
      page: filters?.page || 1,
      pageSize: filters?.pageSize || 100,
    };
    if (filters?.status && filters.status !== 'ALL') {
      params.status = filters.status;
    }
    if (filters?.search) {
      params.search = filters.search;
    }
    if (filters?.categoryId) {
      params.categoryId = filters.categoryId;
    }
    if (filters?.assigneeId) {
      params.assigneeId = filters.assigneeId;
    }
    if (filters?.myTickets !== undefined) {
      params.myTickets = filters.myTickets;
    }

    const response = await client.get('/tickets/list', { params });
    return {
      data: response.data.data || [],
      total: response.data.meta?.pagination?.total || 0,
    };
  },

  getOne: async (documentId: string): Promise<Ticket> => {
    const response = await client.get(`/tickets/${documentId}`, {
      params: {
        'populate[0]': 'category',
        'populate[1]': 'serviceGroup',
        'populate[2]': 'assignee',
      },
    });
    return response.data.data;
  },

  update: async (documentId: string, data: Partial<Ticket>): Promise<Ticket> => {
    const response = await client.put(`/tickets/${documentId}`, { data });
    return response.data.data;
  },

  reassign: async (documentId: string, assigneeIds: number[]): Promise<Ticket> => {
    const response = await client.put(`/tickets/${documentId}/reassign`, { assigneeIds });
    return response.data.data;
  },

  getAssignableUsers: async (): Promise<AssignableUser[]> => {
    const response = await client.get('/tickets/assignable-users');
    return response.data.data || [];
  },

  getCategories: async (): Promise<ServiceGroup[]> => {
    const response = await client.get('/tickets/categories');
    return response.data.data || [];
  },

  submit: async (data: {
    requesterName?: string;
    requesterPhone?: string;
    requesterDepartment?: string;
    comment: string;
    categoryId?: number;
    serviceGroupId: number;
  }): Promise<{ ticketNumber: string; id: number; documentId?: string }> => {
    const response = await client.post('/tickets/submit', data);
    return response.data.data;
  },
};
