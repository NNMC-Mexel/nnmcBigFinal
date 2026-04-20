import { factories } from "@strapi/strapi";

let lastSyncAt = 0;
const SYNC_TTL_MS = 30_000;

async function syncFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  if (!pmUrl) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(
      `${pmUrl}/api/departments?pagination[pageSize]=500&fields[0]=name_ru`,
      { signal: ctrl.signal }
    ).finally(() => clearTimeout(t));
    if (!res.ok) return;
    const json: any = await res.json();
    const items: any[] = Array.isArray(json?.data) ? json.data : [];
    for (const item of items) {
      const attrs = item?.attributes || item;
      const name = String(attrs?.name_ru || "").trim();
      if (!name) continue;
      const existing = await (strapi.entityService as any).findMany(
        "api::department.department",
        { filters: { name }, limit: 1 }
      );
      const list = Array.isArray(existing) ? existing : [];
      if (list.length === 0) {
        await (strapi.entityService as any).create("api::department.department", {
          data: { name },
        });
      }
    }
  } catch {
    /* ignore — keep serving cached list */
  }
}

export default factories.createCoreController(
  "api::department.department",
  ({ strapi }) => ({
    async find(ctx) {
      const now = Date.now();
      if (now - lastSyncAt > SYNC_TTL_MS) {
        lastSyncAt = now;
        await syncFromPm(strapi);
      }
      return await super.find(ctx);
    },
  })
);
