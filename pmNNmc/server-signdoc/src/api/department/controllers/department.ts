import { factories } from "@strapi/strapi";

let lastSyncAt = 0;
const SYNC_TTL_MS = 30_000;

function internalHeaders() {
  const token = process.env.INTERNAL_SYNC_TOKEN;
  return token ? { "X-Internal-Token": token } : null;
}

async function syncDepartmentsFromPm(strapi: any, pmUrl: string) {
  const headers = internalHeaders();
  if (!headers) return;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `${pmUrl}/api/internal-sync/departments`,
      { signal: ctrl.signal, headers }
    ).finally(() => clearTimeout(t));
    if (!res.ok) return;
    const json: any = await res.json();
    const items: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    for (const item of items) {
      const attrs = item?.attributes || item;
      const name = String(attrs?.name_ru || "").trim();
      const key = String(attrs?.key || "").trim();
      if (!name) continue;
      const filters = key ? { $or: [{ key }, { name }] } : { name };
      const existing = await (strapi.entityService as any).findMany(
        "api::department.department",
        { filters, limit: 1 }
      );
      const list = Array.isArray(existing) ? existing : [];
      if (list.length === 0) {
        await (strapi.entityService as any).create("api::department.department", {
          data: { name, key: key || null },
        });
      } else if (key && list[0]?.key !== key) {
        await strapi.entityService.update("api::department.department", list[0].id, {
          data: { key },
        });
      }
    }
  } catch {
    /* ignore */
  }
}

async function syncUsersFromPm(strapi: any, pmUrl: string) {
  const headers = internalHeaders();
  if (!headers) return;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `${pmUrl}/api/internal-sync/users`,
      { signal: ctrl.signal, headers }
    ).finally(() => clearTimeout(t));
    if (!res.ok) return;
    const json: any = await res.json();
    const items: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
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
      const deptKey = String(pmUser?.department?.key || "").trim();
      const isKpiResponsible = Boolean(pmUser?.isKpiResponsible);
      const isSuperAdmin = Boolean(pmUser?.isSuperAdmin);

      let departmentId: number | null = null;
      if (deptKey) {
        const dept = await strapi.db
          .query("api::department.department")
          .findOne({ where: { key: deptKey } });
        departmentId = dept?.id || null;
      }
      if (!departmentId && deptName) {
        const dept = await strapi.db
          .query("api::department.department")
          .findOne({ where: { name: deptName } });
        departmentId = dept?.id || null;
      }

      const existing = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({ where: { email }, populate: ["department"] });

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
            isKpiResponsible,
            isSuperAdmin,
          },
        });
      } else {
        const patch: Record<string, any> = {};
        const existingDepartmentId = Number(existing?.department?.id || existing?.department || 0) || null;
        if (fullName && fullName !== existing.fullName) patch.fullName = fullName;
        if ((departmentId || null) !== existingDepartmentId) patch.department = departmentId;
        if (isKpiResponsible !== existing.isKpiResponsible) patch.isKpiResponsible = isKpiResponsible;
        if (isSuperAdmin !== existing.isSuperAdmin) patch.isSuperAdmin = isSuperAdmin;
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
