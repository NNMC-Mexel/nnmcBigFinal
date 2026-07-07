import bpmClient from './bpmClient';

export type BpmRequestType =
  | 'VACATION'
  | 'SICK_LEAVE'
  | 'BUSINESS_TRIP'
  | 'MEMO'
  | 'TRAINING'
  | 'CERTIFICATE';

export type BpmRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'MANAGER_REVIEW'
  | 'HR_REVIEW'
  | 'ACCOUNTING_REVIEW'
  | 'ONEC_PENDING'
  | 'ONEC_SENT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface BpmRequestTopType {
  type: BpmRequestType;
  title: string;
  description: string;
  enabled: boolean;
}

export interface BpmRequest {
  id: number;
  documentId?: string;
  requestNumber: string;
  type: BpmRequestType;
  title: string;
  status: BpmRequestStatus;
  workflowStage?: string;
  employeeName?: string;
  employeePosition?: string;
  employeeDepartment?: string;
  employeeOrganization?: string;
  managerName?: string;
  managerPosition?: string;
  vacationType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  replacementEmployeeName?: string;
  comment?: string;
  onecStatus?: 'not_required' | 'pending' | 'sent' | 'error';
  onecDocumentNumber?: string | null;
  onecError?: string | null;
  submittedAt?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  history?: Array<{
    at?: string;
    by?: string;
    action?: string;
    label?: string;
  }>;
}

export const bpmRequestsApi = {
  topTypes: async (): Promise<BpmRequestTopType[]> => {
    const response = await bpmClient.get('/bpm-requests/top-types');
    return response.data.data || [];
  },

  list: async (params?: {
    mine?: boolean;
    status?: string;
    type?: string;
  }): Promise<{ data: BpmRequest[]; canReview: boolean; canAdvance: boolean }> => {
    const response = await bpmClient.get('/bpm-requests', { params });
    return {
      data: response.data.data || [],
      canReview: response.data.meta?.canReview === true,
      canAdvance: response.data.meta?.canAdvance === true,
    };
  },

  createVacation: async (data: {
    vacationType: string;
    startDate: string;
    endDate: string;
    replacementEmployeeName?: string;
    comment?: string;
    managerName?: string;
    managerPosition?: string;
  }): Promise<BpmRequest> => {
    const response = await bpmClient.post('/bpm-requests/vacation', data);
    return response.data.data;
  },

  sendToOneC: async (id: number | string): Promise<BpmRequest> => {
    const response = await bpmClient.post(`/bpm-requests/${id}/send-to-1c`);
    return response.data.data;
  },

  advance: async (id: number | string): Promise<BpmRequest> => {
    const response = await bpmClient.post(`/bpm-requests/${id}/advance`);
    return response.data.data;
  },
};
