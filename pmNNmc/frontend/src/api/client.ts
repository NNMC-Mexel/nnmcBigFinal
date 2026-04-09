import axios from 'axios';

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

const client = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests (check both localStorage and sessionStorage)
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors — redirect to Keycloak logout on 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear all tokens
      localStorage.removeItem('jwt');
      sessionStorage.removeItem('jwt');
      localStorage.removeItem('user');
      localStorage.removeItem('auth-storage');
      localStorage.removeItem('kpi_token');
      localStorage.removeItem('kpi_user_cache_v1');
      localStorage.removeItem('kpi_cache_v1');
      localStorage.removeItem('conf_token');
      localStorage.removeItem('journal_token');
      localStorage.removeItem('signdoc_token');
      localStorage.removeItem('signdoc_user');
      // End Keycloak session — let Keycloak show its own logout/login page
      const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL || 'http://192.168.101.25:12012';
      const keycloakRealm = import.meta.env.VITE_KEYCLOAK_REALM || 'nnmc';
      window.location.href = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/logout`;
    }
    return Promise.reject(error);
  }
);

export default client;
