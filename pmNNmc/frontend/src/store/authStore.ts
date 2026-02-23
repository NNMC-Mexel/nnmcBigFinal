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
      isLoading: false,
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
        // Очищаем KPI-сессию при выходе из основного приложения
        localStorage.removeItem('kpi_token');
        localStorage.removeItem('kpi_user_cache_v1');
        localStorage.removeItem('kpi_cache_v1');
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
          set({ isAuthenticated: false, user: null });
          return;
        }

        try {
          const user = await authApi.getMe();
          set({
            user,
            token,
            isAuthenticated: true,
          });
        } catch {
          localStorage.removeItem('jwt');
          sessionStorage.removeItem('jwt');
          set({
            user: null,
            token: null,
            isAuthenticated: false,
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

  // SuperAdmin имеет полный доступ ко всему
  const resolveFeatureFlag = (value: boolean | undefined, fallback = true) =>
    typeof value === 'boolean' ? value : fallback;

  // Может редактировать проект (описание, даты, приоритет, статус)
  const canEditProject = isSuperAdmin || isAdmin || isLead || isMember;
  const canDeleteProject = isSuperAdmin || isAdmin || isLead;

  // Может назначать ответственных пользователей
  const canAssignResponsible = isSuperAdmin || isAdmin || isLead || isMember;

  // Может создавать и редактировать задачи
  const canManageTasks = isSuperAdmin || isAdmin || isLead || isMember;

  // Может удалять задачи
  const canDeleteTasks = isSuperAdmin || isAdmin || isLead || isMember;

  // Может менять статус задач (выполнено/не выполнено) - все пользователи как исполнители
  const canChangeTaskStatus = true;

  // Может добавлять записи совещаний
  const canAddMeetingNotes = true;

  // Может редактировать/удалять записи совещаний (свои или все для руководителей)
  const canManageMeetingNotes = isSuperAdmin || isAdmin || isLead || isMember;

  // Может перетаскивать проекты на канбане
  const canDragProjects = (isSuperAdmin || isAdmin || isLead) && resolveFeatureFlag(user?.canViewBoard, true);

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

  const featureDashboard = resolveFeatureFlag(user?.canViewDashboard, true);
  const featureBoard = resolveFeatureFlag(user?.canViewBoard, true);
  const featureTable = resolveFeatureFlag(user?.canViewTable, true);
  const featureHelpdesk = resolveFeatureFlag(user?.canViewHelpdesk, true);
  const featureKpi = resolveFeatureFlag(user?.canViewKpi, true);

  const canViewDashboard = featureDashboard && hasProjectDepartmentAccess;
  const canViewBoard = featureBoard && hasProjectDepartmentAccess;
  const canViewTable = featureTable && hasProjectDepartmentAccess;
  const canViewHelpdesk = featureHelpdesk && hasHelpdeskDepartmentAccess;
  const canViewKpi = featureKpi && hasHelpdeskDepartmentAccess;
  const canViewKpiIt = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'IT');
  const canViewKpiMedical = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'MEDICAL_EQUIPMENT');
  const canViewKpiEngineering = canViewKpi && (isSuperAdmin || isAdmin || departmentKey === 'ENGINEERING');
  const canViewProjects = canViewDashboard || canViewBoard || canViewTable;

  // KPI Табель (kpiServer) — отдельный модуль расчёта KPI по табелям
  // Доступ: явный флаг на пользователе ИЛИ Admin/SuperAdmin
  const featureKpiTimesheet = resolveFeatureFlag(user?.canViewKpiTimesheet as boolean | undefined, false);
  const canViewKpiTimesheet = isSuperAdmin || isAdmin || featureKpiTimesheet;

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
