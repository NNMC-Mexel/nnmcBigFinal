import client from './client';

export interface ProjectDocument {
  id: number;
  documentId: string;
  description?: string;
  createdAt: string;
  file: {
    id: number;
    name: string;
    url: string;
    size: number;
    mime: string;
  };
  uploadedBy?: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

export const getProjectDocuments = async (projectDocumentId: string): Promise<ProjectDocument[]> => {
  const res = await client.get('/project-documents', {
    params: {
      'filters[project][documentId][$eq]': projectDocumentId,
      'populate[0]': 'file',
      'populate[1]': 'uploadedBy',
      'sort': 'createdAt:desc',
    },
  });
  return res.data.data;
};

export const uploadDocument = async (
  projectDocumentId: string,
  file: File,
  description?: string
): Promise<ProjectDocument> => {
  // First upload the file
  const formData = new FormData();
  formData.append('files', file);

  const uploadRes = await client.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const uploadedFile = uploadRes.data[0];

  // Then create the document record
  const res = await client.post('/project-documents', {
    data: {
      file: uploadedFile.id,
      project: projectDocumentId,
      description,
    },
  });

  return res.data.data;
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  await client.delete(`/project-documents/${documentId}`);
};
