const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';

const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

export const getMediaUrl = (url?: string | null): string => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
};
