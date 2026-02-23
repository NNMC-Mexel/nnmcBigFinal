import { create } from 'zustand';
import type { Project, BoardStage, Department } from '../types';
import { projectsApi } from '../api/projects';
import { stagesApi } from '../api/stages';
import { departmentsApi } from '../api/departments';

interface ProjectFilters {
  status?: string;
  department?: string;
  priority?: string;
  search?: string;
  showOverdue?: boolean;
}

interface ProjectState {
  projects: Project[];
  stages: BoardStage[];
  departments: Department[];
  selectedProject: Project | null;
  filters: ProjectFilters;
  showArchiveColumn: boolean;
  isLoading: boolean;
  error: string | null;

  fetchProjects: (filters?: ProjectFilters) => Promise<void>;
  fetchProjectsByDepartment: (departmentKey?: string, additionalFilters?: ProjectFilters) => Promise<void>;
  fetchStages: () => Promise<void>;
  fetchDepartments: () => Promise<void>;
  fetchProject: (id: number | string) => Promise<void>;
  setFilters: (filters: Partial<ProjectFilters>) => void;
  clearFilters: () => void;
  setShowArchiveColumn: (visible: boolean) => void;
  updateProjectLocally: (documentId: string, updates: Partial<Project>) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  stages: [],
  departments: [],
  selectedProject: null,
  filters: {},
  showArchiveColumn: false,
  isLoading: false,
  error: null,

  fetchProjects: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const appliedFilters = filters || get().filters;
      const projects = await projectsApi.getAll(appliedFilters);
      set({ projects, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to fetch projects', isLoading: false });
    }
  },

  // Получить проекты по отделу пользователя
  fetchProjectsByDepartment: async (departmentKey, additionalFilters) => {
    set({ isLoading: true, error: null });
    try {
      const filters = {
        ...additionalFilters,
        department: departmentKey,
      };
      const projects = await projectsApi.getAll(filters);
      set({ projects, filters, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to fetch projects', isLoading: false });
    }
  },

  fetchStages: async () => {
    try {
      const stages = await stagesApi.getAll();
      set({ stages });
    } catch (error) {
      console.error('Failed to fetch stages:', error);
    }
  },

  fetchDepartments: async () => {
    try {
      const departments = await departmentsApi.getAll();
      set({ departments });
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  },

  fetchProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const project = await projectsApi.getOne(id);
      set({ selectedProject: project, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to fetch project', isLoading: false });
    }
  },

  setFilters: (filters) => {
    const newFilters = { ...get().filters, ...filters };
    set({ filters: newFilters });
  },

  clearFilters: () => {
    set({ filters: {} });
  },

  setShowArchiveColumn: (visible) => {
    set({ showArchiveColumn: visible });
  },

  updateProjectLocally: (documentId, updates) => {
    const projects = get().projects.map((p) =>
      p.documentId === documentId ? { ...p, ...updates } : p
    );
    set({ projects });
  },
}));

// Helper to get stage for a project based on progress
export const getProjectStage = (project: Project, stages: BoardStage[]): BoardStage | undefined => {
  if (project.manualStageOverride) {
    return project.manualStageOverride;
  }

  const orderedStages = [...stages].sort((a, b) => (a.order || 0) - (b.order || 0));
  return orderedStages[0];
};
