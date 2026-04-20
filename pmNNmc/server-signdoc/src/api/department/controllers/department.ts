import { factories } from "@strapi/strapi";

let lastSyncAt = 0;
const SYNC_TTL_MS = 30_000;

async function syncDepartmentsFromPm(strapi: any, pmUrl: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
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
    /* ignore */
  }
}

async function syncUsersFromPm(strapi: any, pmUrl: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `${pmUrl}/api/users?populate=department&pagination[pageSize]=500`,
      { signal: ctrl.signal }
    ).finally(() => clearTimeout(t));
    if (!res.ok) return;
    const items: any[] = (await res.json()) as any[];
    if (!Array.isArray(items)) return;

    const authRole = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });
    if (!authRole) return;

    for (const pmUser of items) {
      const email = String(pmUser?.email || "").toLowerCase().trim();
      if (!email) continue;
      const username = String(pmUser?.username || email).trim();
      const fullName = String(pmUser?.fullName || "").trim();
      const deptName = String(pmUser?.department?.name_ru || "").trim();

      let departmentId: number | null = null;
      if (deptName) {
        const dept = await strapi.db
          .query("api::department.department")
          .findOne({ where: { name: deptName } });
        departmentId = dept?.id || null;
      }

      const existing = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({ where: { email } });

      if (!existing) {
        await (strapi.entityService as any).create("plugin::users-permissions.user", {
          data: {
            username,
            email,
            fullName,
            department: departmentId,
            provider: "local",
            password: `kc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
            confirmed: true,
            blocked: false,
            role: authRole.id,
          },
        });
      } else {
        const patch: Record<string, any> = {};
        if (fullName && fullName !== existing.fullName) patch.fullName = fullName;
        if (departmentId && existing.department !== departmentId) patch.department = departmentId;
        if (Object.keys(patch).length > 0) {
          await strapi.entityService.update("plugin::users-permissions.user", existing.id, {
            data: patch,
          });
        }
      }
    }
  } catch {
    /* ignore */
  }
}

export default factories.createCoreController(
  "api::department.department",
  ({ strapi }) => ({
    async find(ctx) {
      const now = Date.now();
      const pmUrl = process.env.SERVER_PM_URL;
      if (pmUrl && now - lastSyncAt > SYNC_TTL_MS) {
        lastSyncAt = now;
        await syncDepartmentsFromPm(strapi, pmUrl);
        await syncUsersFromPm(strapi, pmUrl);
      }
      return await super.find(ctx);
    },
  })
);
