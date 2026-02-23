import client from './client';
import type { LoginCredentials, RegisterData, AuthResponse, User } from '../types';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await client.post('/auth/local', credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await client.post('/auth/local/register', data);
    return response.data;
  },

  forgotPassword: async (email: string): Promise<void> => {
    await client.post('/auth/forgot-password', { email });
  },

  resetPassword: async (code: string, password: string, passwordConfirmation: string): Promise<void> => {
    await client.post('/auth/reset-password', {
      code,
      password,
      passwordConfirmation,
    });
  },

  getMe: async (): Promise<User> => {
    const response = await client.get('/users/me', {
      params: {
        populate: ['role', 'department'],
      },
    });
    return response.data;
  },

  emailConfirmation: async (confirmation: string): Promise<void> => {
    await client.get(`/auth/email-confirmation?confirmation=${confirmation}`);
  },
};
