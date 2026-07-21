import bpmClient from './bpmClient';

export type OnboardingStatus =
  | 'CREATED'
  | 'OPENED'
  | 'DRAFT'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'SUBMITTED'
  | 'RETURNED'
  | 'APPROVED'
  | 'SENT_ONEC'
  | 'ONEC_ERROR';

export interface OnboardingInvitation {
  id?: number;
  documentId?: string;
  token: string;
  iin?: string;
  phone?: string;
  status: OnboardingStatus;
  expiresAt: string;
  attemptsLeft?: number;
  returnedSections?: string[];
  hrComment?: string;
  draft?: Record<string, any>;
  submittedAt?: string;
  approvedAt?: string;
  sentToOnecAt?: string;
  oneCStatus?: string;
  oneCResponse?: Record<string, any>;
  history?: Array<{ at: string; by: string; action: string; label: string }>;
  publicUrl?: string;
  whatsappUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OnboardingUploadedFile {
  id: number;
  name: string;
  url: string;
  mime?: string;
  type: string;
  size: number;
}

export type OnboardingExtraFieldSection = 'identity' | 'documents' | 'contacts' | 'education' | 'medical' | 'family' | 'work' | 'bank';
export type OnboardingExtraFieldType = 'text' | 'textarea' | 'date' | 'select' | 'checkbox' | 'file';

export interface OnboardingExtraField {
  id: string;
  section: OnboardingExtraFieldSection;
  label: string;
  type: OnboardingExtraFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface OnboardingSettings {
  documentRequirements: Record<string, boolean>;
  extraFields: OnboardingExtraField[];
}

export const onboardingApi = {
  async publicStatus(token: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.get(`/onboarding/public/${token}`);
    return response.data.data;
  },

  async positions(token: string): Promise<string[]> {
    const response = await bpmClient.get(`/onboarding/public/${token}/positions`);
    return response.data.data || [];
  },

  async publicSettings(token: string): Promise<OnboardingSettings> {
    const response = await bpmClient.get(`/onboarding/public/${token}/settings`);
    return response.data.data;
  },

  async verify(token: string, iin: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/public/${token}/verify`, { token, iin });
    return response.data.data;
  },

  async saveDraft(token: string, iin: string, draft: Record<string, any>, currentStep: number): Promise<OnboardingInvitation> {
    const response = await bpmClient.put(`/onboarding/public/${token}/draft`, { iin, draft, currentStep });
    return response.data.data;
  },

  async uploadFiles(token: string, iin: string, files: File[]): Promise<OnboardingUploadedFile[]> {
    const formData = new FormData();
    formData.append('iin', iin);
    files.forEach((file) => formData.append('files', file));
    const response = await bpmClient.post(`/onboarding/public/${token}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data || [];
  },

  async submit(token: string, iin: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/public/${token}/submit`, { iin });
    return response.data.data;
  },

  async list(): Promise<OnboardingInvitation[]> {
    const response = await bpmClient.get('/onboarding/invitations');
    return response.data.data || [];
  },

  async settings(): Promise<OnboardingSettings> {
    const response = await bpmClient.get('/onboarding/settings');
    return response.data.data;
  },

  async updateSettings(config: OnboardingSettings): Promise<OnboardingSettings> {
    const response = await bpmClient.put('/onboarding/settings', { config });
    return response.data.data;
  },

  async createInvitation(data: { iin: string; phone: string }): Promise<OnboardingInvitation> {
    const response = await bpmClient.post('/onboarding/invitations', data);
    return response.data.data;
  },

  async extend(id: number): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/invitations/${id}/extend`);
    return response.data.data;
  },

  async unblock(id: number): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/invitations/${id}/unblock`);
    return response.data.data;
  },

  async returnForCorrection(id: number, sections: string[], comment: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/invitations/${id}/return`, { sections, comment });
    return response.data.data;
  },

  async approve(id: number): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/invitations/${id}/approve`);
    return response.data.data;
  },

  async sendToOneC(id: number): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/invitations/${id}/send-to-1c`);
    return response.data.data;
  },
};
