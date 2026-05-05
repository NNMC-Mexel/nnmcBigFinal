type WsClient = {
  userId: number;
  socket: any;
};

const clientsByUser = new Map<number, Set<any>>();
let initialized = false;

function send(socket: any, payload: any) {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}

function addClient(userId: number, socket: any) {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId)!.add(socket);
}

function removeClient(userId: number, socket: any) {
  const sockets = clientsByUser.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) clientsByUser.delete(userId);
}

async function getUnreadCount(strapi: any, userId: number) {
  return await strapi.db.query('api::notification.notification').count({
    where: { recipient: userId, isRead: false },
  });
}

async function getUserIdFromToken(strapi: any, token: string) {
  if (!token) return null;
  const jwtService = strapi.plugin('users-permissions').service('jwt');
  const payload = await jwtService.verify(token);
  const userId = Number(payload?.id);
  if (!userId) return null;

  const user = await strapi.entityService.findOne('plugin::users-permissions.user', userId, {
    fields: ['id'],
  });
  return user?.id ? userId : null;
}

function parseRequestUrl(request: any) {
  try {
    return new URL(request.url || '', 'http://localhost');
  } catch {
    return null;
  }
}

export function initNotificationRealtime(strapi: any) {
  if (initialized) return;
  const httpServer = strapi?.server?.httpServer;
  if (!httpServer) {
    strapi.log.warn('[notifications] WebSocket server was not initialized: httpServer is unavailable');
    return;
  }

  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (request: any, socket: any, head: any) => {
    const url = parseRequestUrl(request);
    if (url?.pathname !== '/ws/notifications') return;

    try {
      const token = String(url.searchParams.get('token') || '').trim();
      const userId = await getUserIdFromToken(strapi, token);
      if (!userId) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, async (ws: any) => {
        addClient(userId, ws);
        ws.on('close', () => removeClient(userId, ws));
        ws.on('error', () => removeClient(userId, ws));
        send(ws, {
          type: 'notifications:connected',
          unreadCount: await getUnreadCount(strapi, userId),
        });
      });
    } catch (error: any) {
      strapi.log.warn(`[notifications] WebSocket auth failed: ${error?.message || error}`);
      socket.destroy();
    }
  });

  initialized = true;
  strapi.log.info('[notifications] WebSocket endpoint enabled at /ws/notifications');
}

export async function publishNotificationState(strapi: any, userId: number, type = 'notifications:updated') {
  const sockets = clientsByUser.get(Number(userId));
  if (!sockets || sockets.size === 0) return;
  const unreadCount = await getUnreadCount(strapi, Number(userId));
  sockets.forEach((socket) => send(socket, { type, unreadCount }));
}

export async function publishNotificationCreated(strapi: any, userId: number, notification: any) {
  const sockets = clientsByUser.get(Number(userId));
  if (!sockets || sockets.size === 0) return;
  const unreadCount = await getUnreadCount(strapi, Number(userId));
  sockets.forEach((socket) =>
    send(socket, {
      type: 'notifications:new',
      unreadCount,
      notification,
    })
  );
}
