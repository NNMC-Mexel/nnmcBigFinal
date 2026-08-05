import client from './client';
import type { Department, MediaFile, User } from '../types';

export type ProjectCalculationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'RETURNED'
  | 'APPROVED'
  | 'REJECTED';

export type ExtraCostCategory = 'licenses' | 'infrastructure' | 'travel' | 'contractors' | 'purchases';

export interface ProjectExtraCost {
  id?: string;
  category: ExtraCostCategory;
  description: string;
  amount: number;
}

export interface ProjectTeamMember {
  userId: number;
  name?: string;
  email?: string | null;
  position?: string | null;
  role: string;
}

export interface ProjectCalculationHistoryItem {
  action: string;
  status: ProjectCalculationStatus;
  actorId?: number;
  actorName?: string;
  actorEmail?: string | null;
  comment?: string | null;
  at: string;
}

export interface ProjectCalculationVersion {
  requestNumber?: string;
  version?: number;
  title?: string;
  actualHours?: number;
  actualTotal?: number;
  aiHours?: number;
  aiTotal?: number;
  marketAmount?: number;
  submittedAt?: string | null;
  snapshottedAt?: string;
}

export interface ProjectCalculation {
  id: number;
  documentId?: string;
  requestNumber: string;
  version: number;
  status: ProjectCalculationStatus;
  title: string;
  description?: string | null;
  customer?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  creator?: User;
  department?: Department;
  teamMembers?: User[];
  teamSnapshot: ProjectTeamMember[];
  hourlyRate: number;
  actualHours: number;
  actualExtraCosts: ProjectExtraCost[];
  actualTotal: number;
  aiHours: number;
  aiExtraCosts: ProjectExtraCost[];
  aiTotal: number;
  marketAmount: number;
  actualEfficiencyPerEmployee: number;
  aiEfficiencyPerEmployee: number;
  aiReportFiles?: MediaFile[];
  marketFiles?: MediaFile[];
  reviewComment?: string | null;
  reviewer?: User;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  autosavedAt?: string | null;
  history?: ProjectCalculationHistoryItem[];
  versionHistory?: ProjectCalculationVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCalculationContext {
  userId: number;
  canAccess: boolean;
  canCreate: boolean;
  canReview: boolean;
  canViewDepartment: boolean;
  isSuperAdmin: boolean;
  department: Department | null;
  hourlyRate: number;
  departmentCode?: string | null;
  departmentRates: Array<{ departmentId: number; hourlyRate: number }>;
  departments: Department[];
  users: User[];
}

export interface DepartmentCalculationSetting {
  departmentId: number;
  enabled: boolean;
  code: string;
  hourlyRate: number;
}

export interface UserCalculationAccessRule {
  userId: number;
  canCreate: boolean;
  canViewDepartment: boolean;
}

export interface ProjectCalculationSettings {
  id: number;
  reviewerEmail: string;
  margin: number;
  actualFormula: string;
  aiFormula: string;
  departmentSettings: DepartmentCalculationSetting[];
  userAccessRules: UserCalculationAccessRule[];
  departments: Department[];
  users: User[];
}

export interface ProjectCalculationInput {
  title: string;
  description?: string;
  customer: string;
  startDate: string;
  endDate: string;
  departmentId?: number;
  team: Array<{ userId: number; role: string }>;
  actualHours: number;
  actualExtraCosts: ProjectExtraCost[];
  aiHours: number;
  aiExtraCosts: ProjectExtraCost[];
  marketAmount: number;
  aiReportFileIds: number[];
  marketFileIds: number[];
}

export const projectCalculationsApi = {
  getContext: async (): Promise<ProjectCalculationContext> => {
    const response = await client.get('/project-calculations/context');
    return response.data.data;
  },

  getAll: async (params?: Record<string, string | number | undefined>): Promise<{ data: ProjectCalculation[]; meta: any }> => {
    const response = await client.get('/project-calculations', { params });
    return response.data;
  },

  getOne: async (id: number): Promise<ProjectCalculation> => {
    const response = await client.get(`/project-calculations/${id}`);
    return response.data.data;
  },

  create: async (data: ProjectCalculationInput): Promise<ProjectCalculation> => {
    const response = await client.post('/project-calculations', data);
    return response.data.data;
  },

  update: async (id: number, data: ProjectCalculationInput): Promise<ProjectCalculation> => {
    const response = await client.put(`/project-calculations/${id}`, data);
    return response.data.data;
  },

  submit: async (id: number): Promise<ProjectCalculation> => {
    const response = await client.post(`/project-calculations/${id}/submit`);
    return response.data.data;
  },

  action: async (
    id: number,
    action: 'start-review' | 'return' | 'approve' | 'reject' | 'reopen',
    comment = '',
  ): Promise<ProjectCalculation> => {
    const response = await client.post(`/project-calculations/${id}/${action}`, { comment });
    return response.data.data;
  },

  upload: async (file: File): Promise<MediaFile> => {
    const form = new FormData();
    form.append('files', file);
    const response = await client.post('/upload', form);
    return response.data[0];
  },

  getSettings: async (): Promise<ProjectCalculationSettings> => {
    const response = await client.get('/project-calculations/settings');
    return response.data.data;
  },

  updateSettings: async (data: Omit<ProjectCalculationSettings, 'id' | 'departments' | 'users'>): Promise<ProjectCalculationSettings> => {
    const response = await client.put('/project-calculations/settings', data);
    return response.data.data;
  },
};
