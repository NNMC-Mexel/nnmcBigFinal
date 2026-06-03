type NotificationRealtimePayload = {
  type: string;
  unreadCount?: number;
  notification?: unknown;
  ticketId?: number | null;
  ticketDocumentId?: string | null;
  ticketNumber?: string | null;
  status?: string | null;
};

type Listener = (payload: NotificationRealtimePayload) => void;

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:1337`
    : 'http://127.0.0.1:1337';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;

function getToken() {
  return localStorage.getItem('jwt') || sessionStorage.getItem('jwt') || '';
}

function getSocketUrl(token: string) {
  const wsBase = API_URL.replace(/^http/i, (value) => (value.toLowerCase() === 'https' ? 'wss' : 'ws'));
  return `${wsBase}/ws/notifications?token=${encodeURIComponent(token)}`;
}

function emit(payload: NotificationRealtimePayload) {
  listeners.forEach((listener) => listener(payload));
  window.dispatchEvent(new CustomEvent('nnmc:notifications', { detail: payload }));
}

function scheduleReconnect() {
  if (manualClose || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNotificationsSocket();
  }, 3000);
}

export function connectNotificationsSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = getToken();
  if (!token) return;

  manualClose = false;
  try {
    socket = new WebSocket(getSocketUrl(token));
  } catch (err) {
    // Constructing the socket can throw synchronously (e.g. an insecure ws://
    // from a secure context). Realtime is best-effort — never crash the app.
    console.warn('Realtime notifications unavailable:', err);
    socket = null;
    return;
  }
  socket.onmessage = (event) => {
    try {
      emit(JSON.parse(event.data));
    } catch {
      // Ignore malformed realtime messages.
    }
  };
  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };
  socket.onerror = () => {
    socket?.close();
  };
}

export function subscribeToNotificationRealtime(listener: Listener) {
  listeners.add(listener);
  connectNotificationsSocket();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && socket) {
      manualClose = true;
      socket.close();
      socket = null;
    }
  };
}
