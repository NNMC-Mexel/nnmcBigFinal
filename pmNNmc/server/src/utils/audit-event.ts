import { getRequestUserId } from './activity-log';

export async function createAuditEvent(
  strapi: any,
  payload: {
    action: string;
    entityType: string;
    entityId: string | number;
    oldData?: any;
    newData?: any;
    actor?: number | null;
    actorEmail?: string | null;
  }
) {
  try {
    const actorId = payload.actor ?? getRequestUserId(strapi);
    await (strapi.entityService as any).create('api::audit-event.audit-event', {
      data: {
        actor: actorId || null,
        actorEmail: payload.actorEmail || null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: String(payload.entityId),
        oldData: payload.oldData || null,
        newData: payload.newData || null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    strapi.log?.warn?.(`[audit] failed to write event: ${error?.message || error}`);
  }
}
