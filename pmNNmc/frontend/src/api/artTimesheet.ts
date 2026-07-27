import bpmClient from './bpmClient';

export type ArtStatus =
  | 'DRAFT'
  | 'MANAGER_REVIEW'
  | 'HR_REVIEW'
  | 'ACTIVE'
  | 'FINAL_HR_REVIEW'
  | 'APPROVED'
  | 'ONEC_PENDING'
  | 'ONEC_SENT'
  | 'KPI_READY'
  | 'CLOSED'
  | 'RETURNED';

export type ArtPhase = 'PLAN' | 'ACTUAL' | 'CLOSED';

export interface ArtUser {
  id: number;
  username?: string;
  name?: string;
}

export interface ArtPeriod {
  id: number;
  documentId?: string;
  periodKey: string;
  year: number;
  month: number;
  organizationId?: string;
  organizationName: string;
  departmentId?: string;
  departmentName: string;
  status: ArtStatus;
  phase: ArtPhase;
  revision: number;
  employeeCount: number;
  plannedHours: number;
  actualHours: number;
  unresolvedDays: number;
  locked: boolean;
  lastDecisionComment?: string | null;
  history: Array<{
    at?: string;
    by?: string;
    action?: string;
    label?: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    comment?: string;
    revision?: number;
  }>;
  onecStatus: 'not_ready' | 'pending' | 'sent' | 'error';
  onecDocumentNumber?: string | null;
  onecError?: string | null;
  kpiStatus: 'not_ready' | 'pending' | 'sent' | 'error';
  kpiArchiveId?: string | null;
  kpiError?: string | null;
  ownerUser?: ArtUser | null;
  responsibleUser?: ArtUser | null;
  managerUser?: ArtUser | null;
  availableActions: Record<string, boolean>;
}

export interface ArtDay {
  id: number;
  dayKey: string;
  employeeCardId?: number | null;
  employeeIin?: string;
  physicalPersonId?: string;
  personnelNumber: string;
  employeeName: string;
  positionName?: string;
  scheduleName?: string;
  scheduleKind: 'FIVE_DAY' | 'SIX_DAY' | 'SHIFT' | 'CUSTOM';
  date: string;
  plannedCode: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedHours: number;
  actualCode?: string | null;
  actualHours: number;
  nightHours: number;
  overtimeHours: number;
  holidayHours: number;
  sourceType: 'SCHEDULE' | 'BPM_EVENT' | 'MANUAL' | 'SYSTEM';
  sourceRequestNumber?: string | null;
  eventType?: string | null;
  manualOverride: boolean;
  plannedManualOverride?: boolean;
  actualManualOverride?: boolean;
  overrideReason?: string | null;
  version: number;
  editedByName?: string;
}

export interface ArtDayCode {
  code: string;
  label: string;
  shortLabel: string;
  color: string;
  kind: 'work' | 'absence' | 'rest' | 'attention';
  defaultHours: number;
  onecCode?: string;
}

export interface ArtPolicy {
  id?: number;
  policyKey: string;
  name: string;
  version: number;
  dayCodes: ArtDayCode[];
  holidayDates: string[];
  scheduleRules?: Record<string, unknown>;
  onecMappings?: Record<string, any>;
}

export interface ArtDepartment {
  id: string;
  name: string;
  organizationId?: string;
  organizationName: string;
  employeeCount: number;
  canCreate?: boolean;
}

export interface ArtPeriodDetail {
  period: ArtPeriod;
  days: ArtDay[];
  events: Array<Record<string, unknown>>;
  policy: ArtPolicy;
}

export const artTimesheetApi = {
  departments: async (): Promise<{ data: ArtDepartment[]; canCreate: boolean }> => {
    const response = await bpmClient.get('/art/departments');
    return { data: response.data.data || [], canCreate: response.data.meta?.canCreate === true };
  },

  periods: async (params?: { year?: number; month?: number; departmentId?: string }): Promise<{ data: ArtPeriod[]; canCreate: boolean }> => {
    const response = await bpmClient.get('/art/periods', { params });
    return { data: response.data.data || [], canCreate: response.data.meta?.canCreate === true };
  },

  create: async (data: {
    year: number;
    month: number;
    departmentId?: string;
    departmentName: string;
    organizationId?: string;
    organizationName?: string;
  }): Promise<ArtPeriod> => {
    const response = await bpmClient.post('/art/periods', data);
    return response.data.data;
  },

  get: async (id: number | string): Promise<ArtPeriodDetail> => {
    const response = await bpmClient.get(`/art/periods/${id}`);
    return response.data.data;
  },

  updateDays: async (
    id: number | string,
    data: {
      revision: number;
      phase: ArtPhase;
      changes: Array<{
        id: number;
        code: string;
        hours?: number;
        start?: string;
        end?: string;
        nightHours?: number;
        overtimeHours?: number;
        holidayHours?: number;
        reason?: string;
      }>;
    }
  ): Promise<ArtPeriod> => {
    const response = await bpmClient.patch(`/art/periods/${id}/days`, data);
    return response.data.data;
  },

  generateActual: async (id: number | string): Promise<ArtPeriod> => {
    const response = await bpmClient.post(`/art/periods/${id}/generate-actual`);
    return response.data.data;
  },

  applyPattern: async (
    id: number | string,
    data: {
      revision: number;
      personnelNumber: string;
      pattern: 'FIVE_DAY_PLUS_SATURDAY' | 'SIX_DAY' | 'SHIFT_24_48';
      workingSaturday?: string;
      anchorDate?: string;
      hours?: number;
    }
  ): Promise<ArtPeriod> => {
    const response = await bpmClient.post(`/art/periods/${id}/apply-pattern`, data);
    return response.data.data;
  },

  transition: async (id: number | string, action: string, comment?: string): Promise<ArtPeriod> => {
    const response = await bpmClient.post(`/art/periods/${id}/transition`, { action, comment });
    return response.data.data;
  },

  sendToOneC: async (id: number | string): Promise<ArtPeriod> => {
    const response = await bpmClient.post(`/art/periods/${id}/send-to-1c`);
    return response.data.data;
  },

  sendToKpi: async (id: number | string): Promise<ArtPeriod> => {
    const response = await bpmClient.post(`/art/periods/${id}/send-to-kpi`);
    return response.data.data;
  },

  myCalendar: async (year: number, month: number): Promise<{
    employee: null | { id: number; fio: string; workplaces: Array<Record<string, unknown>> };
    days: ArtDay[];
    periods: ArtPeriod[];
  }> => {
    const response = await bpmClient.get('/art/my-calendar', { params: { year, month } });
    return response.data.data;
  },

  policy: async (): Promise<ArtPolicy> => {
    const response = await bpmClient.get('/art/policy');
    return response.data.data;
  },

  updatePolicy: async (data: Partial<ArtPolicy>): Promise<ArtPolicy> => {
    const response = await bpmClient.put('/art/policy', data);
    return response.data.data;
  },
};
