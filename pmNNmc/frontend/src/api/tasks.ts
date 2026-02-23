import client from './client';
import type { Task } from '../types';

const extractErrorMessage = (error: any): string => {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    'Request failed'
  );
};

const mapDepartmentError = (error: any): never => {
  const status = error?.response?.status;
  const message = extractErrorMessage(error);
  const lower = message.toLowerCase();

  if (status === 403 && lower.includes('department')) {
    throw new Error('Department restriction: you can manage tasks only within your department.');
  }

  throw new Error(message);
};

export const tasksApi = {
  create: async (data: {
    title: string;
    description?: string;
    project: string; // documentId
    completed?: boolean;
    assignee?: number;
    order?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<Task> => {
    try {
      const response = await client.post('/tasks', { data });
      return response.data.data;
    } catch (error) {
      mapDepartmentError(error);
    }
  },

  update: async (
    documentId: string,
    data: {
      title?: string;
      description?: string;
      completed?: boolean;
      assignee?: number | null;
      order?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<Task> => {
    try {
      const response = await client.put(`/tasks/${documentId}`, { data });
      return response.data.data;
    } catch (error) {
      mapDepartmentError(error);
    }
  },

  delete: async (documentId: string): Promise<void> => {
    try {
      await client.delete(`/tasks/${documentId}`);
    } catch (error) {
      mapDepartmentError(error);
    }
  },

};
