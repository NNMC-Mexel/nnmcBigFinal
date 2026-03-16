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
          
          // Сохраняем токен
          if (rememberMe) {
            localStorage.setItem('jwt', response.jwt);
          } else {
            sessionStorage.setItem('jwt', response.jwt);
          }
          
          // Fetch full user with role and department
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
          
          // Fetch full user with role and department
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
        // Очищаем все sub-service сессии при выходе
        localStorage.removeItem('kpi_token');
        localStorage.removeItem('kpi_user_cache_v1');
        localStorage.removeItem('kpi_cache_v1');
        localStorage.removeItem('conf_token');
        localStorage.removeItem('journal_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      checkAuth: async () => {
        // Проверяем оба хранилища
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

// Helper to get user's department and role info
export const useUserRole = () => {
  const user = useAuthStore((state) => state.user);

  const roleType = (user?.role?.type || '').toLowerCase().replace(/\s+/g, '');
  const roleName = (user?.role?.name || '').toLowerCase().replace(/\s+/g, '');

  // Debug: log role info
  if (user?.role) {
    console.log('User role:', { type: user.role.type, name: user.role.name, roleType, roleName });
  }

  // Проверяем на admin/superadmin роли
  const superAdminRoles = ['superadmin', 'super_admin', 'суперадмин'];
  const isSuperAdmin = superAdminRoles.some(role => roleName.includes(role) || roleType.includes(role));

  const adminRoles = ['admin', ...superAdminRoles];
  const isAdmin = adminRoles.some(role => roleName.includes(role) || roleType.includes(role));

  const leadRoles = ['lead', 'руководитель'];
  const isLead = leadRoles.some(role => roleName.includes(role) || roleType.includes(role));

  const isMember = !isAdmin && !isLead;

  let role: 'superadmin' | 'admin' | 'lead' | 'member' = 'member';
  if (isSuperAdmin) role = 'superadmin';
  else if (isAdmin) role = 'admin';
  else if (isLead) role = 'lead';
  else if (isMember) role = 'member';
  
  // Отдел пользователя
  const userDepartment = user?.department as Department | undefined;
  const departmentKey = userDepartment?.key;
  
  // === ПРАВА ДОСТУПА ===

  // Если флаг явно задан (true/false) — он имеет приоритет.
  // Если флаг не задан (undefined/null) — используем fallback.
  const resolveAccess = (flag: boolean | undefined, fallback: boolean) =>
    typeof flag === 'boolean' ? flag : fallback;

  // Может редактировать проект (описание, даты, приоритет, статус)
  const canEditProject = isSuperAdmin || isAdmin || isLead || isMember;
  const canDeleteProject = resolveAccess(user?.canDeleteProject, isSuperAdmin || isAdmin || isLead);

  // Может назначать ответственных пользователей
  const canAssignResponsible = isSuperAdmin || isAdmin || isLead || isMember;

  // Может создавать и редактировать задачи
  const canManageTasks = isSuperAdmin || isAdmin || isLead || isMember;

  // Может удалять задачи
  const canDeleteTasks = isSuperAdmin || isAdmin || isLead || isMember;

  // Может менять статус задач
  const canChangeTaskStatus = true;

  // Может добавлять записи совещаний
  const canAddMeetingNotes = true;

  // Может редактировать/удалять записи совещаний
  const canManageMeetingNotes = isSuperAdmin || isAdmin || isLead || isMember;

  // Может перетаскивать проекты на канбане
  const canDragProjects = resolveAccess(user?.canDragProjects, isSuperAdmin || isAdmin || isLead);

  // Может работать с документами
  const canManageDocuments = isSuperAdmin || isAdmin || isLead || isMember;

  // Может создавать анкеты
  const canManageSurveys = isSuperAdmin || isAdmin || isLead || isMember;

  // Обратная совместимость - общий canEdit (для Lead и Admin)
  const canEdit = isSuperAdmin || isAdmin || isLead;

  // Helpdesk: IT, MEDICAL_EQUIPMENT, ENGINEERING видят заявки
  const HELPDESK_DEPARTMENTS = ['IT', 'MEDICAL_EQUIPMENT', 'ENGINEERING'];
  const hasHelpdeskDepartmentAccess =
    isSuperAdmin || isAdmin || HELPDESK_DEPARTMENTS.includes(departmentKey || '');

  // Projects: IT, DIGITALIZATION видят проекты
  const PROJECT_DEPARTMENTS = ['IT', 'DIGITALIZATION'];
  const hasProjectDepartmentAccess =
    isSuperAdmin || isAdmin || PROJECT_DEPARTMENTS.includes(departmentKey || '');

  const canViewDashboard = resolveAccess(user?.canViewDashboard, hasProjectDepartmentAccess);
  const canViewBoard = resolveAccess(user?.canViewBoard, hasProjectDepartmentAccess);
  const canViewTable = resolveAccess(user?.canViewTable, hasProjectDepartmentAccess);
  const canViewHelpdesk = resolveAccess(user?.canViewHelpdesk, hasHelpdeskDepartmentAccess);
  const canViewKpi = resolveAccess(user?.canViewKpi, hasHelpdeskDepartmentAccess);
  const canViewKpiIt = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'IT' || user?.canViewKpi === true);
  const canViewKpiMedical = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'MEDICAL_EQUIPMENT' || user?.canViewKpi === true);
  const canViewKpiEngineering = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'ENGINEERING' || user?.canViewKpi === true);
  const canViewProjects = canViewDashboard || canViewBoard || canViewTable;

  // KPI Табель — явный флаг или Admin/SuperAdmin
  const canViewKpiTimesheet = isSuperAdmin || isAdmin || user?.canViewKpiTimesheet === true;

  return {
    isAdmin,
    isSuperAdmin,
    isLead,
    isMember,
    role,
    userDepartment,
    departmentKey,
    // Детальные права
    canEditProject,
    canDeleteProject,
    canAssignResponsible,
    canManageTasks,
    canDeleteTasks,
    canChangeTaskStatus,
    canAddMeetingNotes,
    canManageMeetingNotes,
    canDragProjects,
    canManageDocuments,
    canManageSurveys,
    // Feature visibility
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
    // Общий флаг (для обратной совместимости)
    canEdit,
  };
};
