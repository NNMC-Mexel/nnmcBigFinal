import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Department } from '../types';
import { authApi } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  rememberMe: boolean;

  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: { username: string; email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      rememberMe: true,

      login: async (identifier, password, rememberMe = true) => {
        set({ isLoading: true, error: null, rememberMe });
        try {
          const response = await authApi.login({ identifier, password });

          if (rememberMe) {
            localStorage.setItem('jwt', response.jwt);
          } else {
            sessionStorage.setItem('jwt', response.jwt);
          }

          const userWithDetails = await authApi.getMe();

          set({
            user: userWithDetails,
            token: response.jwt,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: { message?: string } } } };
          set({
            error: err.response?.data?.error?.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register(data);
          localStorage.setItem('jwt', response.jwt);

          const userWithDetails = await authApi.getMe();

          set({
            user: userWithDetails,
            token: response.jwt,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: { message?: string } } } };
          set({
            error: err.response?.data?.error?.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('jwt');
        sessionStorage.removeItem('jwt');
        localStorage.removeItem('kpi_token');
        localStorage.removeItem('kpi_user_cache_v1');
        localStorage.removeItem('kpi_cache_v1');
        localStorage.removeItem('conf_token');
        localStorage.removeItem('journal_token');
        localStorage.removeItem('signdoc_token');
        localStorage.removeItem('signdoc_user');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
        if (!token) {
          set({ isAuthenticated: false, user: null, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const user = await authApi.getMe();
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          localStorage.removeItem('jwt');
          sessionStorage.removeItem('jwt');
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe,
      }),
    }
  )
);

// Department-based permission hook
// All permissions come from user.isSuperAdmin + user.department flags
export const useUserRole = () => {
  const user = useAuthStore((state) => state.user);

  const isSuperAdmin = user?.isSuperAdmin === true;
  // Backward compatibility alias
  const isAdmin = isSuperAdmin;

  const dept = user?.department as Department | undefined;
  const userDepartment = dept;
  const departmentKey = dept?.key;

  // Helper: SuperAdmin gets everything, otherwise check department flag
  const deptFlag = (flag: boolean | undefined) => isSuperAdmin || flag === true;

  // Feature visibility — from department
  const canViewNews = deptFlag(dept?.canViewNews);
  const canViewDashboard = deptFlag(dept?.canViewDashboard);
  const canViewBoard = deptFlag(dept?.canViewBoard);
  const canViewTable = deptFlag(dept?.canViewTable);
  const canViewHelpdesk = deptFlag(dept?.canViewHelpdesk);
  const canViewKpiIt = deptFlag(dept?.canViewKpiIt);
  const canViewKpiMedical = deptFlag(dept?.canViewKpiMedical);
  const canViewKpiEngineering = deptFlag(dept?.canViewKpiEngineering);
  const canViewKpiTimesheet = deptFlag(dept?.canViewKpiTimesheet);
  const canAccessConf = deptFlag(dept?.canAccessConf);
  const canAccessJournal = deptFlag(dept?.canAccessJournal);
  const canAccessSigndoc = deptFlag(dept?.canAccessSigndoc);
  const canManageNews = deptFlag(dept?.canManageNews);
  const canDeleteProject = deptFlag(dept?.canDeleteProject);
  const canDragProjects = deptFlag(dept?.canDragProjects);
  const canManageProjectAssignments = deptFlag(dept?.canManageProjectAssignments);
  const canManageTickets = deptFlag(dept?.canManageTickets);
  const canViewActivityLog = deptFlag(dept?.canViewActivityLog);

  // Composite
  const canViewKpi = canViewKpiIt || canViewKpiMedical || canViewKpiEngineering;
  const canViewProjects = canViewDashboard || canViewBoard || canViewTable;

  // Project capabilities — everyone with access can do these
  const canEditProject = canViewProjects;
  const canAssignResponsible = canViewProjects;
  const canManageTasks = canViewProjects;
  const canDeleteTasks = canViewProjects;
  const canChangeTaskStatus = true;
  const canAddMeetingNotes = true;
  const canManageMeetingNotes = canViewProjects;
  const canManageDocuments = canViewProjects;
  const canManageSurveys = canViewProjects;

  // Backward compat
  const isLead = false; // No more lead role
  const isMember = !isSuperAdmin;
  const role: 'superadmin' | 'admin' | 'lead' | 'member' = isSuperAdmin ? 'superadmin' : 'member';
  const canEdit = isSuperAdmin;

  return {
    isAdmin,
    isSuperAdmin,
    isLead,
    isMember,
    role,
    userDepartment,
    departmentKey,
    // Feature visibility
    canViewNews,
    canViewDashboard,
    canViewBoard,
    canViewTable,
    canViewHelpdesk,
    canViewKpi,
    canViewKpiIt,
    canViewKpiMedical,
    canViewKpiEngineering,
    canViewKpiTimesheet,
    canViewProjects,
    canAccessConf,
    canAccessJournal,
    canAccessSigndoc,
    canManageNews,
    canDeleteProject,
    canDragProjects,
    canManageProjectAssignments,
    canManageTickets,
    canViewActivityLog,
    // Project capabilities
    canEditProject,
    canAssignResponsible,
    canManageTasks,
    canDeleteTasks,
    canChangeTaskStatus,
    canAddMeetingNotes,
    canManageMeetingNotes,
    canManageDocuments,
    canManageSurveys,
    // Backward compat
    canEdit,
  };
};
