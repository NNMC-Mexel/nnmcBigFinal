import client from './client';
import axios from 'axios';
import type { Ticket, ServiceGroup, AssignableUser } from '../types';

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

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
};

// Public API (no auth)
export const publicTicketsApi = {
  getCategories: async (): Promise<ServiceGroup[]> => {
    const res = await axios.get(`${API_URL}/api/tickets/public/categories`);
    return res.data.data || [];
  },

  submit: async (data: {
    requesterName: string;
    requesterPhone?: string;
    requesterDepartment: string;
    comment: string;
    categoryId?: number;
    serviceGroupId: number;
  }): Promise<{ ticketNumber: string; id: number }> => {
    const res = await axios.post(`${API_URL}/api/tickets/public/submit`, data);
    return res.data.data;
  },
};
