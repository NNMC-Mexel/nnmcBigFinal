import client from './client';

const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337');

export interface NewsAttachment {
  id: number;
  url: string;
  name: string;
  mime: string;
  size: number; // KB
  ext: string;
}

export interface NewsAuthor {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
}

export interface NewsPost {
  id: number;
  documentId: string;
  title: string;
  content?: string;
  excerpt?: string;
  coverImage?: NewsAttachment;
  attachments?: NewsAttachment[];
  category: 'NEWS' | 'ANNOUNCEMENT' | 'EVENT' | 'UPDATE';
  pinned: boolean;
  published: boolean;
  author?: NewsAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface NewsFilters {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Resolve a Strapi media URL to an absolute URL */
export const getMediaUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
};

/** Returns initials for avatar */
export const getAuthorName = (author?: NewsAuthor): string => {
  if (!author) return 'Аноним';
  if (author.firstName || author.lastName) {
    return `${author.firstName || ''} ${author.lastName || ''}`.trim();
  }
  return author.username || 'Аноним';
};

export const getAuthorInitials = (author?: NewsAuthor): string => {
  const name = getAuthorName(author);
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
};

const POPULATE_PARAMS =
  'populate[coverImage]=true&populate[attachments]=true&populate[author][fields][0]=id&populate[author][fields][1]=username&populate[author][fields][2]=firstName&populate[author][fields][3]=lastName';

export const newsApi = {
  /** Get published posts for the news feed */
  getPublished: async (filters?: NewsFilters) => {
    const params = new URLSearchParams(POPULATE_PARAMS);
    params.set('filters[published][$eq]', 'true');
    params.set('sort[0]', 'pinned:desc');
    params.set('sort[1]', 'createdAt:desc');
    params.set('pagination[pageSize]', String(filters?.pageSize || 50));
    params.set('pagination[page]', String(filters?.page || 1));

    if (filters?.category && filters.category !== 'ALL') {
      params.set('filters[category][$eq]', filters.category);
    }
    if (filters?.search) {
      params.set('filters[$or][0][title][$containsi]', filters.search);
      params.set('filters[$or][1][excerpt][$containsi]', filters.search);
      params.set('filters[$or][2][content][$containsi]', filters.search);
    }

    const res = await client.get(`/news-posts?${params.toString()}`);
    return {
      data: (res.data.data || []) as NewsPost[],
      total: res.data.meta?.pagination?.total || 0,
    };
  },

  /** Get ALL posts (admin view — drafts + published) */
  getAll: async () => {
    const params = new URLSearchParams(POPULATE_PARAMS);
    params.set('sort', 'createdAt:desc');
    params.set('pagination[pageSize]', '200');

    const res = await client.get(`/news-posts?${params.toString()}`);
    return (res.data.data || []) as NewsPost[];
  },

  getOne: async (documentId: string) => {
    const res = await client.get(`/news-posts/${documentId}?${POPULATE_PARAMS}`);
    return res.data.data as NewsPost;
  },

  create: async (data: Partial<Omit<NewsPost, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>>) => {
    const res = await client.post('/news-posts', { data });
    return res.data.data as NewsPost;
  },

  update: async (
    documentId: string,
    data: Partial<Omit<NewsPost, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>>
  ) => {
    const res = await client.put(`/news-posts/${documentId}`, { data });
    return res.data.data as NewsPost;
  },

  delete: async (documentId: string) => {
    await client.delete(`/news-posts/${documentId}`);
  },

  /** Upload files to Strapi media library */
  uploadFiles: async (files: File[]): Promise<NewsAttachment[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const res = await client.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return Array.isArray(res.data) ? res.data : [res.data];
  },
};
