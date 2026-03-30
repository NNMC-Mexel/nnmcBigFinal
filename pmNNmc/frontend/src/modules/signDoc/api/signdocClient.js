// SignDoc API client
// Pointed at server-signdoc Strapi backend (port 12015)

const VITE_SIGNDOC_API_BASE =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_SIGNDOC_API_BASE
    : "";
const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:12015/api`;
const API_BASE = VITE_SIGNDOC_API_BASE || DEFAULT_API_BASE;
// Server root (without /api) for file URLs like /uploads/...
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, "");

const TOKEN_KEY = "signdoc_token";
const USER_KEY = "signdoc_user";

function isAscii(value) {
  return /^[\x00-\x7F]*$/.test(String(value || ""));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
}

function getAuthHeader() {
  const token = getToken();
  if (!token || !isAscii(token)) {
    if (token) localStorage.removeItem(TOKEN_KEY);
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (text && text.trim().startsWith("{")) {
      data = JSON.parse(text);
    } else {
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text;
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data) {
      if (typeof data.error === "string") msg = data.error;
      else if (typeof data.message === "string") msg = data.message;
      else if (data.error && typeof data.error === "object")
        msg = data.error.message || JSON.stringify(data.error);
    }
    throw new Error(msg);
  }

  return data;
}

// ─── Auth ────────────────────────────────────────────────────
export async function apiLogin(identifier, password) {
  const res = await fetch(`${API_BASE}/auth/local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await handleResponse(res);
  if (data.jwt) {
    localStorage.setItem(TOKEN_KEY, data.jwt);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  return data;
}

export async function apiMe() {
  const res = await fetch(`${API_BASE}/users/me?populate=department`, {
    headers: { ...getAuthHeader() },
  });
  const data = await handleResponse(res);
  localStorage.setItem(USER_KEY, JSON.stringify(data));
  return data;
}

// ─── Documents ───────────────────────────────────────────────
async function fetchAllPages(baseUrl) {
  let allData = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(
      `${baseUrl}${separator}pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
      { headers: { ...getAuthHeader() } }
    );
    const json = await handleResponse(res);
    const { data, meta } = json;
    allData = allData.concat(data);
    if (page >= meta.pagination.pageCount) break;
    page++;
  }
  return allData;
}

export async function getMyDocuments() {
  const user = getUser();
  const baseUrl = `${API_BASE}/documents?filters[$or][0][creator][id][$eq]=${user.id}&filters[$or][1][assigned_users][id][$eq]=${user.id}&populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true&populate[subdivision]=true`;
  return fetchAllPages(baseUrl);
}

export async function getPendingDocuments() {
  const user = getUser();
  const baseUrl = `${API_BASE}/documents?filters[assigned_users][id][$eq]=${user.id}&populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true&populate[subdivision]=true`;
  return fetchAllPages(baseUrl);
}

export function isMyTurnToSign(doc, userId) {
  const signers = doc?.signers || [];
  const mySignerIndex = signers.findIndex((s) => Number(s.userId) === Number(userId));
  if (mySignerIndex === -1) return false;
  if (signers[mySignerIndex].status !== "pending") return false;
  if (!doc.signatureSequential) return true;
  return signers.slice(0, mySignerIndex).every((s) => s.status === "signed");
}

export async function getActionablePendingDocuments() {
  const user = getUser();
  const allPending = await getPendingDocuments();
  return allPending.filter((doc) => isMyTurnToSign(doc, user.id));
}

export async function createDocument(documentData) {
  const assignedUserIds = documentData.signers
    ? documentData.signers.map((s) => s.userId)
    : [];
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ data: { ...documentData, assigned_users: assignedUserIds } }),
  });
  const json = await handleResponse(res);
  return json.data;
}

export async function updateDocument(documentId, data) {
  const res = await fetch(`${API_BASE}/documents/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ data }),
  });
  const json = await handleResponse(res);
  return json.data;
}

export async function cancelDocument(documentId) {
  return updateDocument(documentId, { status: "cancelled" });
}

// ─── File upload ─────────────────────────────────────────────
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("files", file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { ...getAuthHeader() },
    body: formData,
  });
  const json = await handleResponse(res);
  return json[0];
}

// ─── File URLs (MinIO pre-signed) ────────────────────────────
export async function getDocumentFileUrl(documentId, fileType = "current") {
  const res = await fetch(
    `${API_BASE}/documents/${documentId}/file-url?file=${fileType}`,
    { headers: { ...getAuthHeader() } }
  );
  const json = await handleResponse(res);
  const url = json.url;
  // Prepend server base if URL is relative (e.g. /uploads/...)
  if (url && !url.startsWith("http")) return `${SERVER_BASE}${url}`;
  return url;
}

export async function presignDocumentFile(documentId, key) {
  const res = await fetch(
    `${API_BASE}/documents/${documentId}/presign?key=${encodeURIComponent(key)}`,
    { headers: { ...getAuthHeader() } }
  );
  const json = await handleResponse(res);
  const url = json.url;
  if (url && !url.startsWith("http")) return `${SERVER_BASE}${url}`;
  return url;
}

// ─── Users ───────────────────────────────────────────────────
export async function getAllUsers() {
  const res = await fetch(`${API_BASE}/users?populate=department`, {
    headers: { ...getAuthHeader() },
  });
  return handleResponse(res);
}

// ─── Departments ─────────────────────────────────────────────
export async function getDepartments() {
  const res = await fetch(`${API_BASE}/departments?sort=name`, {
    headers: { ...getAuthHeader() },
  });
  const json = await handleResponse(res);
  return json.data;
}

// ─── Document Types ──────────────────────────────────────────
export async function getDocumentTypes() {
  const res = await fetch(`${API_BASE}/document-types?sort=name`, {
    headers: { ...getAuthHeader() },
  });
  const json = await handleResponse(res);
  return json.data;
}

// ─── Subdivisions ────────────────────────────────────────────
export async function getSubdivisions(departmentId = null) {
  const filter = departmentId
    ? `&filters[department][id][$eq]=${departmentId}`
    : "";
  const res = await fetch(
    `${API_BASE}/subdivisions?sort=name${filter}&populate=department&pagination[pageSize]=100`,
    { headers: { ...getAuthHeader() } }
  );
  const json = await handleResponse(res);
  return json.data;
}
