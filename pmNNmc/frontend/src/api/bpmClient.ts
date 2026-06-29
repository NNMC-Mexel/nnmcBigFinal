import axios from 'axios';

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';

const rawBpmUrl = import.meta.env.VITE_BPM_API_URL || import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const BPM_API_URL = String(rawBpmUrl).replace(/\/+$/, '');
const BPM_BASE_URL = BPM_API_URL.endsWith('/api') ? BPM_API_URL : `${BPM_API_URL}/api`;

const bpmClient = axios.create({
  baseURL: BPM_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

bpmClient.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('bpm_token') ||
    sessionStorage.getItem('bpm_token') ||
    localStorage.getItem('jwt') ||
    sessionStorage.getItem('jwt');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

bpmClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bpm_token');
      sessionStorage.removeItem('bpm_token');
    }
    return Promise.reject(error);
  }
);

export default bpmClient;
