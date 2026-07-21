import client from '../../../api/client';

export type ProtocolFilter = 'mine' | 'with-me' | 'department' | 'all';

export type ProtocolUser = {
  id: number;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
};

export type ProtocolTask = {
  order?: number;
  title: string;
  shortDescription?: string | null;
  description?: string | null;
  deadline?: string | null;
  responsibleId?: number | null;
  fact?: string | null;
};

export type ProtocolHistoryEntry = {
  timestamp: string;
  userId: number;
  userName: string;
  action: string;
  summary: string;
  version?: number;
};

export type ProtocolPdfFile = {
  id: number;
  name?: string;
  url: string;
  size?: number;
  mime?: string;
  createdAt?: string;
};

export type Protocol = {
  id: number;
  documentId?: string;
  theme: string;
  meetingDate: string;
  creator?: ProtocolUser | null;
  creatorDepartment?: { id: number; name_ru?: string; key?: string } | null;
  attendees: ProtocolUser[];
  responsibles: ProtocolUser[];
  tasks: ProtocolTask[];
  conclusion?: string | null;
  nextMeetingDate?: string | null;
  status: 'draft' | 'published';
  version: number;
  pdfFiles: ProtocolPdfFile[];
  history?: ProtocolHistoryEntry[];
  createdAt?: string;
  updatedAt?: string;
};

export type ProtocolDepartmentUsers = {
  id: number;
  name: string;
  users: ProtocolUser[];
};

export type ProtocolPayload = {
  theme: string;
  meetingDate: string;
  attendees: number[];
  tasks: ProtocolTask[];
  conclusion?: string | null;
  nextMeetingDate?: string | null;
  autosave?: boolean;
};

export const protocolsApi = {
  async list(filter: ProtocolFilter = 'mine'): Promise<Protocol[]> {
    const res = await client.get(`/protocols?filter=${filter}`);
    return res.data?.data || [];
  },

  async findOne(id: number | string): Promise<Protocol> {
    const res = await client.get(`/protocols/${id}`);
    return res.data?.data;
  },

  async create(payload: ProtocolPayload): Promise<Protocol> {
    const res = await client.post('/protocols', payload);
    return res.data?.data;
  },

  async update(id: number | string, payload: Partial<ProtocolPayload>): Promise<{ data: Protocol; bumped: boolean }> {
    const res = await client.put(`/protocols/${id}`, payload);
    return { data: res.data?.data, bumped: Boolean(res.data?.bumped) };
  },

  async publish(id: number | string): Promise<Protocol> {
    const res = await client.post(`/protocols/${id}/publish`);
    return res.data?.data;
  },

  async remove(id: number | string): Promise<void> {
    await client.delete(`/protocols/${id}`);
  },

  async usersByDepartment(): Promise<ProtocolDepartmentUsers[]> {
    const res = await client.get('/protocols/users-by-department');
    return res.data?.data || [];
  },
};
