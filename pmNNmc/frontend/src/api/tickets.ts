import client from './client';
import type { Ticket, ServiceGroup, AssignableUser } from '../types';

export interface TicketFilters {
  status?: string;
  search?: string;
  categoryId?: number;
  assigneeId?: number;
  myTickets?: boolean;
  submittedByMe?: boolean;
  page?: number;
  pageSize?: number;
}

export type ReassignTicketPayload =
  | { assigneeIds: number[] }
  | { departmentId: number; reason: string };

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
    if (filters?.submittedByMe !== undefined) {
      params.submittedByMe = filters.submittedByMe;
    }

    const response = await client.get('/tickets/list', { params });
    return {
      data: response.data.data || [],
      total: response.data.meta?.pagination?.total || 0,
    };
  },

  getMyRequests: async (filters?: TicketFilters): Promise<{ data: Ticket[]; total: number }> => {
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
    const response = await client.get('/tickets/my-requests', { params });
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
        'populate[2]': 'serviceGroup.department',
        'populate[3]': 'targetDepartment',
        'populate[4]': 'assignee',
        'populate[5]': 'attachments',
      },
    });
    return response.data.data;
  },

  update: async (documentId: string, data: Partial<Ticket>): Promise<Ticket> => {
    const response = await client.put(`/tickets/${documentId}`, { data });
    return response.data.data;
  },

  delete: async (documentId: string): Promise<void> => {
    await client.delete(`/tickets/${documentId}`);
  },

  reassign: async (documentId: string, payload: ReassignTicketPayload): Promise<Ticket> => {
    const response = await client.put(`/tickets/${documentId}/reassign`, payload);
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
    attachments?: number[];
  }): Promise<{ ticketNumber: string; id: number; documentId?: string }> => {
    const response = await client.post('/tickets/submit', data);
    return response.data.data;
  },

  submitWithFiles: async (
    data: {
      requesterName?: string;
      requesterPhone?: string;
      requesterDepartment?: string;
      comment: string;
      categoryId?: number;
      serviceGroupId: number;
    },
    files: File[] = []
  ): Promise<{ ticketNumber: string; id: number; documentId?: string }> => {
    if (files.length === 0) {
      return ticketsApi.submit(data);
    }

    const attachmentIds = await ticketsApi.uploadAttachments(files);
    return ticketsApi.submit({
      ...data,
      attachments: attachmentIds,
    });
  },

  uploadAttachments: async (files: File[]): Promise<number[]> => {
    if (files.length === 0) return [];
    const ids: number[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append('files', file);
      const response = await client.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : response.data?.data
        ? [response.data.data]
        : [];
      const uploadedIds = uploaded.map((item: any) => Number(item.id)).filter(Boolean);
      if (uploadedIds.length === 0) {
        throw new Error(`Не удалось загрузить файл: ${file.name}`);
      }
      ids.push(...uploadedIds);
    }
    return ids;
  },
};
