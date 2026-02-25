// Strapi response types
export interface StrapiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export interface StrapiData<T> {
  id: number;
  attributes: T;
}

// User types
export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  department?: Department;
  canViewDashboard?: boolean;
  canViewBoard?: boolean;
  canViewTable?: boolean;
  canViewHelpdesk?: boolean;
  canViewKpi?: boolean;
  canViewKpiTimesheet?: boolean;
  blocked: boolean;
  confirmed: boolean;
}

export interface UserRole {
  id: number;
  name: string;
  type: string;
  description?: string;
}

export interface AssignableUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: Department | null;
}

// Department
export interface Department {
  id: number;
  documentId: string;
  key: 'IT' | 'DIGITALIZATION' | 'MEDICAL_EQUIPMENT' | 'ENGINEERING';
  name_ru: string;
  name_kz: string;
}

// Board Stage
export interface BoardStage {
  id: number;
  documentId: string;
  name_ru: string;
  name_kz: string;
  minPercent: number;
  maxPercent: number;
  order: number;
  color: string;
}

// Task
export interface Task {
  id: number;
  documentId: string;
  title: string;
  description?: string;
  completed?: boolean;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  order: number;
  assignee?: User;
  project?: Project;
}

// Meeting Note
export interface MeetingNote {
  id: number;
  documentId: string;
  text: string;
  createdAt: string;
  author?: User;
  project?: Project;
}

// Project
export interface Project {
  id: number;
  documentId: string;
  title: string;
  description?: string;
  department?: Department;
  startDate?: string;
  dueDate?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  priorityLight: 'GREEN' | 'YELLOW' | 'RED';
  owner?: User;
  supportingSpecialists?: User[];
  responsibleUsers?: User[];
  manualStageOverride?: BoardStage;
  tasks?: Task[];
  meetings?: MeetingNote[];
  createdAt?: string;
  updatedAt?: string;
  // Computed fields
  progressPercent?: number;
  overdue?: boolean;
  dueSoon?: boolean;
  totalTasks?: number;
  doneTasks?: number;
}

// Analytics
export interface AnalyticsTotals {
  total: number;
  active: number;
  archived: number;
  overdue: number;
  dueSoon: number;
}

export interface DepartmentStats {
  departmentKey: string;
  total: number;
  active: number;
  archived: number;
  overdue: number;
  dueSoon: number;
}

export interface WeeklyData {
  weekStart: string;
  count: number;
}

export interface AnalyticsSummary {
  totals: AnalyticsTotals;
  byDepartment: DepartmentStats[];
  byPriority: {
    red: number;
    yellow: number;
    green: number;
  };
  weeklyCreated: WeeklyData[];
  weeklyArchived: WeeklyData[];
}

// Helpdesk - Service Group
export interface ServiceGroup {
  id: number;
  documentId?: string;
  name_ru: string;
  name_kz: string;
  slug: string;
  department?: Department;
  categories?: TicketCategory[];
}

// Helpdesk - Ticket Category
export interface TicketCategory {
  id: number;
  documentId?: string;
  name_ru: string;
  name_kz: string;
  slug: string;
  serviceGroup?: ServiceGroup;
  order: number;
}

// Helpdesk - Ticket
export interface Ticket {
  id: number;
  documentId: string;
  ticketNumber: string;
  requesterName: string;
  requesterPhone?: string;
  requesterDepartment: string;
  comment: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'INVALID';
  complexity?: 'A' | 'B' | 'C' | 'D';
  staffComment?: string;
  category?: TicketCategory;
  serviceGroup?: ServiceGroup;
  assignee?: User[];
  createdAt?: string;
  updatedAt?: string;
}

// Auth
export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  jwt: string;
  user: User;
}
