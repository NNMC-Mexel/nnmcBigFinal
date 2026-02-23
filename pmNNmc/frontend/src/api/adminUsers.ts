import client from './client';

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
  role?: {
    id: number;
    name: string;
    type: string;
  };
  department?: {
    id: number;
    key: string;
    name_ru: string;
    name_kz: string;
  };
}

export interface Role {
  id: number;
  name: string;
  type: string;
  description?: string;
}

export const adminUsersApi = {
  // Получить всех пользователей
  getAll: async (params?: {
    department?: string;
    role?: number;
    search?: string;
    blocked?: boolean;
  }): Promise<AdminUser[]> => {
    const response = await client.get('/admin-users', { params });
    return response.data.data;
  },

  // Получить одного пользователя
  getOne: async (id: number): Promise<AdminUser> => {
    const response = await client.get(`/admin-users/${id}`);
    return response.data.data;
  },

  // Создать пользователя
  create: async (data: {
    email: string;
    username: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: number;
    department?: number | null;
    blocked?: boolean;
    generatePasswordAuto?: boolean;
  }): Promise<{ data: AdminUser; generatedPassword?: string }> => {
    const response = await client.post('/admin-users', data);
    return response.data;
  },

  // Обновить пользователя
  update: async (id: number, data: {
    firstName?: string;
    lastName?: string;
    role?: number;
    department?: number | null;
    blocked?: boolean;
  }): Promise<AdminUser> => {
    const response = await client.put(`/admin-users/${id}`, data);
    return response.data.data;
  },

  // Сброс пароля
  resetPassword: async (id: number, data: {
    newPassword?: string;
    generateNew?: boolean;
  }): Promise<{ message: string; newPassword: string }> => {
    const response = await client.post(`/admin-users/${id}/reset-password`, data);
    return response.data;
  },

  // Удалить пользователя
  delete: async (id: number): Promise<void> => {
    await client.delete(`/admin-users/${id}`);
  },

  // Получить роли
  getRoles: async (): Promise<Role[]> => {
    const response = await client.get('/admin-users/roles/list');
    return response.data.data;
  },
};
