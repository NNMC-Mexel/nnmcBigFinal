import client from './client';
import type { Department } from '../types';

export interface AdminUser {
  id: number;
  documentId?: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  blocked: boolean;
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: number;
    key: string;
    name_ru: string;
    name_kz: string;
  };
  isSuperAdmin?: boolean;
}

export interface HelpdeskRoutingUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  blocked?: boolean;
  department?: {
    id: number;
    key: string;
    name_ru: string;
    name_kz: string;
  } | null;
}

export interface HelpdeskRoutingCategory {
  id: number;
  documentId?: string;
  name_ru: string;
  name_kz: string;
  slug: string;
  order?: number;
  defaultAssignee: HelpdeskRoutingUser[];
}

export interface HelpdeskRoutingGroup {
  id: number;
  documentId?: string;
  name_ru: string;
  name_kz: string;
  slug: string;
  department?: {
    id: number;
    key: string;
    name_ru: string;
    name_kz: string;
  } | null;
  categories: HelpdeskRoutingCategory[];
}

export interface HelpdeskRoutingData {
  groups: HelpdeskRoutingGroup[];
  users: HelpdeskRoutingUser[];
}

export const adminUsersApi = {
  // ─── Users ────────────────────────────────────────────

  getAll: async (params?: {
    department?: number;
    search?: string;
    blocked?: boolean;
  }): Promise<AdminUser[]> => {
    const response = await client.get('/admin-users', { params });
    return response.data.data;
  },

  getOne: async (id: number): Promise<AdminUser> => {
    const response = await client.get(`/admin-users/${id}`);
    return response.data.data;
  },

  create: async (data: {
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    department?: number | null;
    blocked?: boolean;
    isSuperAdmin?: boolean;
  }): Promise<{ data: AdminUser; generatedPassword?: string }> => {
    const response = await client.post('/admin-users', data);
    return response.data;
  },

  update: async (id: number, data: {
    firstName?: string;
    lastName?: string;
    department?: number | null;
    blocked?: boolean;
    isSuperAdmin?: boolean;
  }): Promise<AdminUser> => {
    const response = await client.put(`/admin-users/${id}`, data);
    return response.data.data;
  },

  resetPassword: async (id: number): Promise<{ message: string; newPassword: string; requiresPasswordUpdate?: boolean }> => {
    const response = await client.post(`/admin-users/${id}/reset-password`, {});
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await client.delete(`/admin-users/${id}`);
  },

  createKeycloakUser: async (data: {
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    department?: number | null;
    isSuperAdmin?: boolean;
  }): Promise<{ data: AdminUser; generatedPassword?: string; message: string; requiresPasswordUpdate?: boolean }> => {
    const response = await client.post('/admin-users/create-keycloak', data);
    return response.data;
  },

  // ─── Departments ──────────────────────────────────────

  getDepartments: async (): Promise<Department[]> => {
    const response = await client.get('/admin-users/departments');
    return response.data.data;
  },

  createDepartment: async (data: Partial<Department> & {
    key: string;
    name_ru: string;
    name_kz: string;
  }): Promise<{ data: Department; message: string }> => {
    const response = await client.post('/admin-users/departments', data);
    return response.data;
  },

  updateDepartment: async (id: number, data: Partial<Department>): Promise<{ data: Department; message: string }> => {
    const response = await client.put(`/admin-users/departments/${id}`, data);
    return response.data;
  },

  deleteDepartment: async (id: number): Promise<void> => {
    await client.delete(`/admin-users/departments/${id}`);
  },

  updateDepartmentPermissions: async (departments: Array<{ id: number } & Partial<Department>>): Promise<{ data: Department[]; message: string }> => {
    const response = await client.put('/admin-users/departments/permissions', { departments });
    return response.data;
  },

  getHelpdeskRouting: async (): Promise<HelpdeskRoutingData> => {
    const response = await client.get('/admin-users/helpdesk-routing');
    return response.data.data;
  },

  updateHelpdeskRouting: async (
    categories: Array<{ id: number; assigneeIds: number[] }>
  ): Promise<{ data: HelpdeskRoutingData; message: string }> => {
    const response = await client.put('/admin-users/helpdesk-routing', { categories });
    return response.data;
  },
};
