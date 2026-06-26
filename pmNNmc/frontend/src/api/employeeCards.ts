import client from './client';

export interface EmployeeWorkplace {
  employeeId: string;
  personnelNumber: string;
  primary: boolean;
  organizationId: string;
  organization: string;
  departmentId: string;
  department: string;
  positionId: string;
  position: string;
  employmentType: string;
  rate: number;
  salary: number;
  payroll: number;
  schedule: string;
  hireDate: string | null;
  dismissalDate: string | null;
}

export interface EmployeeCard {
  id: number;
  documentId?: string;
  iin: string;
  physicalPersonId?: string;
  fio: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  birthDate?: string | null;
  gender?: string;
  nationality?: string;
  active: boolean;
  workplaces: EmployeeWorkplace[];
  primaryWorkplace: EmployeeWorkplace | null;
  sourceActualAt?: string | null;
  lastSyncedAt?: string | null;
  keycloakStatus: 'not_created' | 'created' | 'disabled' | 'error';
  keycloakUserId?: string | null;
}

export interface EmployeeCardsResponse {
  items: EmployeeCard[];
  meta: {
    page: number;
    pageSize: number;
    count: number;
    total: number;
    totalPages: number;
    departments: string[];
    departmentStats?: Array<{
      name: string;
      employeeCount: number;
      workplaceCount: number;
    }>;
    departmentCount?: number;
    canSync: boolean;
  };
}

export interface EmployeeSyncStatus {
  running: boolean;
  latest: null | {
    id: number;
    status: 'running' | 'completed' | 'failed';
    trigger: 'manual' | 'scheduled';
    triggeredByName?: string;
    startedAt: string;
    finishedAt?: string | null;
    sourceActualAt?: string | null;
    source?: string;
    stats?: Record<string, number>;
    issues?: Array<Record<string, unknown>>;
    message?: string;
  };
}

export const employeeCardsApi = {
  list: async (params: {
    page: number;
    pageSize: number;
    search?: string;
    department?: string;
    active?: 'true' | 'false' | 'all';
  }): Promise<EmployeeCardsResponse> => {
    const response = await client.get('/employee-cards', { params });
    return response.data;
  },

  syncStatus: async (): Promise<EmployeeSyncStatus> => {
    const response = await client.get('/employee-cards/sync-status');
    return response.data;
  },

  get: async (id: number | string): Promise<EmployeeCard> => {
    const response = await client.get(`/employee-cards/${id}`);
    return response.data.data;
  },

  sync: async (): Promise<{
    success: boolean;
    source?: string;
    sourceActualAt?: string | null;
    stats: Record<string, number>;
    issues: Array<Record<string, unknown>>;
  }> => {
    const response = await client.post('/employee-cards/sync');
    return response.data;
  },
};
