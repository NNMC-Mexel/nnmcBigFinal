// API client for journal/reception backend (server-priemnaya, port 12014)
// Uses journal_token from localStorage, separate from main app JWT

const JOURNAL_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_JOURNAL_API_URL) ||
  `${window.location.protocol}//${window.location.hostname}:12014`;

const API_BASE = `${JOURNAL_API_URL}/api/journal`;

function getAuthHeader() {
  const token = localStorage.getItem('journal_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (text && text.trim().startsWith('{')) {
      data = JSON.parse(text);
    } else {
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text;
    }
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data?.error) msg = typeof data.error === 'string' ? data.error : data.error.message || msg;
    else if (data?.message) msg = typeof data.message === 'string' ? data.message : msg;
    throw new Error(msg);
  }
  return data;
}

export async function journalLogin(login, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const data = await handleResponse(res);
  if (data.token) localStorage.setItem('journal_token', data.token);
  return data;
}

export async function journalGetMe() {
  const res = await fetch(`${API_BASE}/me`, { headers: { ...getAuthHeader() } });
  return handleResponse(res);
}

export function journalLogout() {
  localStorage.removeItem('journal_token');
}

export async function journalGetLookups() {
  const cacheKey = 'journal_lookups_cache_v1';
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }
  const res = await fetch(`${API_BASE}/lookups`);
  const data = await handleResponse(res);
  localStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

export async function journalGetLetters() {
  const res = await fetch(`${API_BASE}/letters`, { headers: { ...getAuthHeader() } });
  return handleResponse(res);
}

export async function journalGetLetter(id) {
  const res = await fetch(`${API_BASE}/letters/${id}`, { headers: { ...getAuthHeader() } });
  return handleResponse(res);
}

export async function journalCreateLetter(data) {
  const res = await fetch(`${API_BASE}/letters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function journalUpdateLetter(id, data) {
  const res = await fetch(`${API_BASE}/letters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function journalDeleteLetter(id) {
  const res = await fetch(`${API_BASE}/letters/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  return handleResponse(res);
}

export async function journalGetHistory(id) {
  const res = await fetch(`${API_BASE}/letters/${id}/history`, { headers: { ...getAuthHeader() } });
  return handleResponse(res);
}
