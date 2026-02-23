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
  // Strapi v5: get all surveys and filter on client side, or use custom endpoint
  const res = await client.get('/project-surveys', {
    params: {
      'populate': '*',
      'sort': 'createdAt:desc',
    },
  });
  
  // Filter by project documentId on client side
  const allSurveys = res.data.data || [];
  return allSurveys.filter((survey: any) => 
    survey.project?.documentId === projectDocumentId
  );
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

// Get survey results (fetch survey with responses and calculate on frontend)
export const getSurveyResults = async (documentId: string): Promise<SurveyResults> => {
  const res = await client.get(`/project-surveys/${documentId}`, {
    params: {
      'populate': '*',
    },
  });
  
  const survey = res.data.data;
  const questions = survey.questions || [];
  const responses = survey.responses || [];
  
  // Calculate statistics on frontend
  const statistics: SurveyStatistics[] = questions.map((question: any) => {
    const questionAnswers = responses
      .map((r: any) => r.answers?.[question.id])
      .filter((a: any) => a !== undefined && a !== null);

    let stats: SurveyStatistics = {
      questionId: question.id,
      questionText: question.text,
      questionType: question.type,
      totalAnswers: questionAnswers.length,
    };

    switch (question.type) {
      case 'single_choice':
      case 'multiple_choice':
        const optionCounts: Record<string, number> = {};
        questionAnswers.forEach((answer: any) => {
          if (Array.isArray(answer)) {
            answer.forEach((a: string) => {
              optionCounts[a] = (optionCounts[a] || 0) + 1;
            });
          } else {
            optionCounts[answer] = (optionCounts[answer] || 0) + 1;
          }
        });
        stats.optionCounts = optionCounts;
        stats.options = question.options;
        break;

      case 'rating':
        const ratings = questionAnswers.map((a: any) => Number(a)).filter((n: number) => !isNaN(n));
        stats.average = ratings.length > 0 
          ? Number((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(2))
          : 0;
        stats.distribution = {};
        ratings.forEach((r: number) => {
          stats.distribution![r] = (stats.distribution![r] || 0) + 1;
        });
        break;

      case 'yes_no':
        const yesCount = questionAnswers.filter((a: any) => a === 'yes' || a === true).length;
        const noCount = questionAnswers.filter((a: any) => a === 'no' || a === false).length;
        stats.yesCount = yesCount;
        stats.noCount = noCount;
        stats.yesPercent = questionAnswers.length > 0 
          ? Number(((yesCount / questionAnswers.length) * 100).toFixed(1))
          : 0;
        break;

      case 'text':
        stats.textAnswers = questionAnswers;
        break;
    }

    return stats;
  });

  return {
    survey: {
      id: survey.id,
      documentId: survey.documentId,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      isAnonymous: survey.isAnonymous,
      publicToken: survey.publicToken,
      expiresAt: survey.expiresAt,
      createdAt: survey.createdAt,
      projectTitle: survey.project?.title,
    },
    totalResponses: responses.length,
    statistics,
    individualResponses: responses.map((r: any) => ({
      id: r.id,
      documentId: r.documentId,
      respondentName: r.respondentName,
      respondentPosition: r.respondentPosition,
      respondentDepartment: r.respondentDepartment,
      respondentEmail: r.respondentEmail,
      isAnonymous: r.isAnonymous,
      answers: r.answers,
      completionTime: r.completionTime,
      createdAt: r.createdAt,
    })),
  };
};

// Duplicate survey (fetch original and create copy)
export const duplicateSurvey = async (documentId: string): Promise<ProjectSurvey> => {
  // Fetch original survey
  const originalRes = await client.get(`/project-surveys/${documentId}`, {
    params: { 'populate': '*' },
  });
  const original = originalRes.data.data;
  
  // Create a copy
  const copyData = {
    title: `${original.title} (копия)`,
    description: original.description,
    project: original.project?.documentId,
    isAnonymous: original.isAnonymous,
    questions: (original.questions || []).map((q: any) => ({
      text: q.text,
      type: q.type,
      options: q.options,
      isRequired: q.isRequired,
      order: q.order,
    })),
    thankYouMessage: original.thankYouMessage,
    allowMultipleResponses: original.allowMultipleResponses,
    showProgressBar: original.showProgressBar,
  };
  
  const res = await client.post('/project-surveys', { data: copyData });
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
