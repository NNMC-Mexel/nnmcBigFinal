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
  kpiAllDepartments?: boolean;
  kpiVisibleDepartments?: Array<{ id: number; name_ru?: string }>;
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
    password?: string;
    firstName?: string;
    lastName?: string;
    department?: number | null;
    blocked?: boolean;
    generatePasswordAuto?: boolean;
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
    kpiAllDepartments?: boolean;
    kpiVisibleDepartments?: number[];
  }): Promise<AdminUser> => {
    const response = await client.put(`/admin-users/${id}`, data);
    return response.data.data;
  },

  resetPassword: async (id: number, data: {
    newPassword?: string;
    generateNew?: boolean;
  }): Promise<{ message: string; newPassword: string }> => {
    const response = await client.post(`/admin-users/${id}/reset-password`, data);
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
    password?: string;
    department?: number | null;
    isSuperAdmin?: boolean;
  }): Promise<{ data: AdminUser; generatedPassword?: string; message: string }> => {
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
};
