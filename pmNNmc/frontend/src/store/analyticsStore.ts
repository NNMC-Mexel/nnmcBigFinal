import { create } from 'zustand';
import type { AnalyticsSummary } from '../types';
import { analyticsApi } from '../api/analytics';

interface AnalyticsState {
  summary: AnalyticsSummary | null;
  isLoading: boolean;
  error: string | null;
  currentDepartment: string | null;
  
  fetchSummary: (department?: string) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  summary: null,
  isLoading: false,
  error: null,
  currentDepartment: null,

  fetchSummary: async (department?: string) => {
    set({ isLoading: true, error: null, currentDepartment: department || null });
    try {
      const summary = await analyticsApi.getSummary(department);
      set({ summary, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to fetch analytics', isLoading: false });
    }
  },
}));
