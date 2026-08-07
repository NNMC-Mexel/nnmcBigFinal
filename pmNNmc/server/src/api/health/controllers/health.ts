import { Context } from 'koa';

// Strapi already serves `/_health`, but that only proves the HTTP server is up —
// it answers 204 even when the database connection is gone. This endpoint
// actually touches the database, so monitoring can tell "running" from "working".
export default {
  async check(ctx: Context) {
    const strapi = (global as any).strapi;
    const startedAt = Date.now();

    let db: 'ok' | 'fail' = 'ok';
    try {
      await strapi.db.connection.raw('select 1');
    } catch (error) {
      db = 'fail';
      strapi.log.error(`[health] database check failed: ${(error as Error)?.message}`);
    }

    // 503 makes Coolify/Uptime Kuma treat the container as unhealthy.
    ctx.status = db === 'ok' ? 200 : 503;
    // Deliberately no host, database name, or version — this route is unauthenticated.
    ctx.body = {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbLatencyMs: Date.now() - startedAt,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  },
};
