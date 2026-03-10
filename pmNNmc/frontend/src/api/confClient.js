// API client for conference rooms backend (server-conf, port 12013)
// Uses conf_token from localStorage, separate from the main app JWT

const CONF_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CONF_API_URL) ||
  `${window.location.protocol}//${window.location.hostname}:12013`;

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('conf_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${CONF_API_URL}${endpoint}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `Request failed: ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const confApi = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export async function confLogin(identifier, password) {
  const response = await fetch(`${CONF_API_URL}/api/auth/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || 'Неверный логин или пароль');
  }
  const data = await response.json();
  localStorage.setItem('conf_token', data.jwt);
  return data;
}

export async function confGetMe() {
  return confApi.get('/api/users/me?populate=role');
}

export function confLogout() {
  localStorage.removeItem('conf_token');
}
