import { factories } from '@strapi/strapi';
import { getUserFlags } from '../../../utils/project-assignments';

function isAuthorizedInternal(ctx: any): boolean {
  const secret = process.env.INTERNAL_SYNC_TOKEN;
  if (!secret) return false;
  const provided = String(
    ctx.request.headers['x-internal-token'] ||
      ctx.request.headers['X-Internal-Token'] ||
      ''
  ).trim();
  return provided === secret;
}

async function ensureSuperAdmin(ctx: any, strapi: any) {
  const user = ctx.state.user;
  if (!user) {
    ctx.throw(401, 'Not authenticated');
  }

  const fullUser = await strapi.entityService.findOne(
    'plugin::users-permissions.user',
    user.id,
    { fields: ['isSuperAdmin'] }
  );
  const { isSuperAdmin } = getUserFlags(fullUser);
  if (!isSuperAdmin) {
    ctx.throw(403, 'Access denied');
  }
}

async function findActorByEmail(strapi: any, email: string) {
  if (!email) return null;
  return await strapi.db
    .query('plugin::users-permissions.user')
    .findOne({ where: { email: email.toLowerCase() } });
}

const UID = 'api::audit-event.audit-event' as any;

export default factories.createCoreController(UID, ({ strapi }) => ({
  async find(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.find(ctx);
  },

  async findOne(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.findOne(ctx);
  },

  async create(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.create(ctx);
  },

  async update(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.update(ctx);
  },

  async delete(ctx) {
    await ensureSuperAdmin(ctx, strapi);
    return await super.delete(ctx);
  },

  async createInternal(ctx) {
    if (!isAuthorizedInternal(ctx)) {
      ctx.status = 403;
      ctx.body = { error: 'forbidden' };
      return;
    }

    const body: any = ctx.request.body || {};
    const action = String(body.action || '').trim();
    const entityType = String(body.entityType || '').trim();
    const entityId = String(body.entityId || '').trim();
    if (!action || !entityType || !entityId) {
      ctx.status = 400;
      ctx.body = { error: 'action, entityType and entityId are required' };
      return;
    }

    const actorEmail = String(body.actorEmail || '').trim().toLowerCase();
    const actor = await findActorByEmail(strapi, actorEmail);
    const created = await (strapi.entityService as any).create(UID, {
      data: {
        actor: actor?.id || null,
        actorEmail: actorEmail || null,
        action,
        entityType,
        entityId,
        oldData: body.oldData || null,
        newData: body.newData || null,
        timestamp: body.timestamp || new Date().toISOString(),
      },
    });

    ctx.body = { id: created.id };
  },
}));
