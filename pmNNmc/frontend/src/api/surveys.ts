import client from './client';
import axios from 'axios';

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export interface SurveyQuestion {
  id?: number;
  text: string;
  type: 'text' | 'single_choice' | 'multiple_choice' | 'rating' | 'yes_no';
  options?: string[];
  isRequired: boolean;
  order: number;
}

export interface ProjectSurvey {
  id: number;
  documentId: string;
  title: string;
  description?: string;
  isAnonymous: boolean;
  status: 'draft' | 'active' | 'closed';
  publicToken: string;
  expiresAt?: string;
  thankYouMessage?: string;
  questions: SurveyQuestion[];
  allowMultipleResponses: boolean;
  showProgressBar: boolean;
  createdAt: string;
  project?: {
    id: number;
    documentId: string;
    title: string;
  };
  createdBy?: {
    id: number;
    username: string;
  };
  responses?: SurveyResponse[];
}

export interface SurveyResponse {
  id: number;
  documentId: string;
  respondentName?: string;
  respondentPosition?: string;
  respondentDepartment?: string;
  respondentEmail?: string;
  answers: Record<string, any>;
  isAnonymous: boolean;
  completionTime?: number;
  createdAt: string;
}

export interface SurveyStatistics {
  questionId: number;
  questionText: string;
  questionType: string;
  totalAnswers: number;
  optionCounts?: Record<string, number>;
  options?: string[];
  average?: number;
  distribution?: Record<number, number>;
  yesCount?: number;
  noCount?: number;
  yesPercent?: number;
  textAnswers?: string[];
}

export interface SurveyResults {
  survey: {
    id: number;
    documentId: string;
    title: string;
    description?: string;
    status: string;
    isAnonymous: boolean;
    publicToken: string;
    expiresAt?: string;
    createdAt: string;
    projectTitle?: string;
  };
  totalResponses: number;
  statistics: SurveyStatistics[];
  individualResponses: SurveyResponse[];
}

// Create a new survey
export const createSurvey = async (data: {
  title: string;
  description?: string;
  project: string; // documentId
  isAnonymous: boolean;
  questions: SurveyQuestion[];
  thankYouMessage?: string;
  allowMultipleResponses?: boolean;
  showProgressBar?: boolean;
  expiresAt?: string;
}): Promise<ProjectSurvey> => {
  // Send data directly - controller will handle relations
  const res = await client.post('/project-surveys', { data });
  return res.data.data;
};

// Get all surveys for a project
export const getProjectSurveys = async (projectDocumentId: string): Promise<ProjectSurvey[]> => {
  const res = await client.get('/project-surveys', {
    params: {
      'populate[0]': 'questions',
      'populate[1]': 'project',
      'populate[2]': 'createdBy',
      'filters[project][documentId][$eq]': projectDocumentId,
      'sort': 'createdAt:desc',
    },
  });
  return res.data.data || [];
};

// Get single survey
export const getSurvey = async (documentId: string): Promise<ProjectSurvey> => {
  const res = await client.get(`/project-surveys/${documentId}`, {
    params: {
      'populate[0]': 'questions',
      'populate[1]': 'responses',
      'populate[2]': 'project',
      'populate[3]': 'createdBy',
    },
  });
  return res.data.data;
};

// Update survey
export const updateSurvey = async (
  documentId: string,
  data: Partial<{
    title: string;
    description: string;
    isAnonymous: boolean;
    questions: SurveyQuestion[];
    thankYouMessage: string;
    allowMultipleResponses: boolean;
    showProgressBar: boolean;
    expiresAt: string;
  }>
): Promise<ProjectSurvey> => {
  const res = await client.put(`/project-surveys/${documentId}`, { data });
  return res.data.data;
};

// Delete survey
export const deleteSurvey = async (documentId: string): Promise<void> => {
  await client.delete(`/project-surveys/${documentId}`);
};

// Toggle survey status (using standard update endpoint)
export const toggleSurveyStatus = async (
  documentId: string,
  status: 'draft' | 'active' | 'closed'
): Promise<ProjectSurvey> => {
  const res = await client.put(`/project-surveys/${documentId}`, { data: { status } });
  return res.data.data;
};

// Get survey results using backend aggregation endpoint
export const getSurveyResults = async (documentId: string): Promise<SurveyResults> => {
  const res = await client.get(`/project-surveys/${documentId}/results`);
  return res.data.data;
};

// Duplicate survey using backend endpoint
export const duplicateSurvey = async (documentId: string): Promise<ProjectSurvey> => {
  const res = await client.post(`/project-surveys/${documentId}/duplicate`);
  return res.data.data;
};

// ===== PUBLIC API (no auth) =====

// Get public survey by token
export const getPublicSurvey = async (token: string): Promise<{
  id: number;
  documentId: string;
  title: string;
  description?: string;
  isAnonymous: boolean;
  questions: SurveyQuestion[];
  showProgressBar: boolean;
  thankYouMessage?: string;
  projectTitle?: string;
}> => {
  // Use axios without auth interceptor for public requests
  const res = await axios.get(`${API_URL}/api/project-surveys/public/${token}`);
  return res.data.data;
};

// Submit response to public survey
export const submitSurveyResponse = async (
  token: string,
  data: {
    answers: Record<string, any>;
    respondentName?: string;
    respondentPosition?: string;
    respondentDepartment?: string;
    respondentEmail?: string;
    completionTime?: number;
  }
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.post(`${API_URL}/api/project-surveys/public/${token}/submit`, data);
  return res.data.data;
};
