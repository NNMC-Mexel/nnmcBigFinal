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

export const onboardingApi = {
  async publicStatus(token: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.get(`/onboarding/public/${token}`);
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

  async submit(token: string, iin: string): Promise<OnboardingInvitation> {
    const response = await bpmClient.post(`/onboarding/public/${token}/submit`, { iin });
    return response.data.data;
  },

  async list(): Promise<OnboardingInvitation[]> {
    const response = await bpmClient.get('/onboarding/invitations');
    return response.data.data || [];
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
