import bpmClient from './bpmClient';

export type BpmRequestType =
  | 'PHYSICAL_PERSON'
  | 'HIRING'
  | 'PERSONNEL_TRANSFER'
  | 'DISMISSAL'
  | 'SICK_LEAVE'
  | 'VACATION'
  | 'DAY_OFF'
  | 'WEEKEND_WORK'
  | 'OVERTIME'
  | 'POSITION_COMBINATION'
  | 'TIMESHEET'
  | 'CHILDCARE_LEAVE'
  | 'CHILDCARE_RETURN'
  | 'VACATION_RECALL'
  | 'UNPAID_LEAVE'
  | 'BUSINESS_TRIP'
  | 'SCHEDULE_CHANGE'
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

export type BpmProcessField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'money' | 'boolean' | 'select' | 'repeater';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  columns?: BpmProcessField[];
};

export interface BpmRequestTopType {
  code: BpmRequestType;
  type?: BpmRequestType;
  integrationType: number;
  title: string;
  description: string;
  category: 'EMPLOYEE' | 'HR' | 'TIME';
  documentObject: string;
  staffOnly?: boolean;
  employeeMode: 'self' | 'single' | 'multiple' | 'none';
  fields: BpmProcessField[];
  enabled: boolean;
}

export interface BpmRequest {
  id: number;
  documentId?: string;
  requestNumber: string;
  type: BpmRequestType;
  integrationType?: number;
  templateVersion?: string;
  title: string;
  status: BpmRequestStatus;
  workflowStage?: string;
  employeeIin?: string;
  employeeName?: string;
  employeePosition?: string;
  employeeDepartment?: string;
  employeeOrganization?: string;
  employeePersonnelNumber?: string;
  managerName?: string;
  managerPosition?: string;
  vacationType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  replacementEmployeeName?: string;
  comment?: string;
  processData?: Record<string, unknown>;
  onecStatus?: 'not_required' | 'pending' | 'sent' | 'error';
  onecDocumentNumber?: string | null;
  onecResponse?: Record<string, unknown> | null;
  onecError?: string | null;
  submittedAt?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  history?: Array<{ at?: string; by?: string; action?: string; label?: string }>;
}

export const bpmRequestsApi = {
  topTypes: async (): Promise<BpmRequestTopType[]> => {
    const response = await bpmClient.get('/bpm-requests/top-types');
    return response.data.data || [];
  },

  list: async (params?: { mine?: boolean; status?: string; type?: string }): Promise<{
    data: BpmRequest[];
    canReview: boolean;
    canAdvance: boolean;
  }> => {
    const response = await bpmClient.get('/bpm-requests', { params });
    return {
      data: response.data.data || [],
      canReview: response.data.meta?.canReview === true,
      canAdvance: response.data.meta?.canAdvance === true,
    };
  },

  createProcess: async (data: {
    type: BpmRequestType;
    data: Record<string, unknown>;
    employeeCardId?: number;
    employeeIin?: string;
    personnelNumber?: string;
    employeeName?: string;
    employeePosition?: string;
    employeeDepartment?: string;
    employeeOrganization?: string;
    comment?: string;
  }): Promise<BpmRequest> => {
    const response = await bpmClient.post('/bpm-requests/process', data);
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

  vacationBalance: async (personnelNumber?: string, date?: string): Promise<Array<{ quatitydays?: string; workyear?: string }>> => {
    const response = await bpmClient.get('/bpm-requests/vacation-balance', { params: { personnelNumber, date } });
    return response.data.data || [];
  },

  syncReference: async (type: number, item: { id: string; name: string }, command: 'Check' | 'Create' = 'Check') => {
    const response = await bpmClient.post('/bpm-requests/reference-data/sync', { type, item, command });
    return response.data;
  },
};
