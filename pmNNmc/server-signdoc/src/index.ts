// import type { Core } from '@strapi/strapi';

import { randomBytes } from 'crypto';

const RADIOLOGY_DEPARTMENT = {
  key: 'RADIOLOGY',
  name: 'Лучевая',
};

// Public role must be empty: no public access to documents.
// Only Keycloak/auth callbacks remain available without login.
async function lockPublicRole(strapi: any) {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });
  if (!publicRole) return;

  const ALLOWED = new Set([
    'plugin::users-permissions.auth.callback',
    'plugin::users-permissions.auth.connect',
  ]);

  const all = await strapi.db
    .query('plugin::users-permissions.permission')
    .findMany({ where: { role: publicRole.id } });

  let removed = 0;
  for (const perm of all) {
    if (!ALLOWED.has(perm.action)) {
      await strapi.db
        .query('plugin::users-permissions.permission')
        .delete({ where: { id: perm.id } });
      removed += 1;
    }
  }
  if (removed > 0) {
    console.log(`🔒 Public role locked: removed ${removed} permissions in server-signdoc`);
  }
}

async function ensureAuthenticatedPermissions(strapi: any) {
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });
  if (!role) return;

  const actions = [
    'api::document.document.find',
    'api::document.document.findOne',
    'api::document.document.findMine',
    'api::document.document.create',
    'api::document.document.update',
    'api::document.document.delete',
    'api::document.document.getFileUrl',
    'api::document.document.presignUrl',
    'api::document.document.revoke',
    'api::document.document.downloadAccountantExcel',
    'api::document-type.document-type.find',
    'api::document-type.document-type.findOne',
    'api::department.department.find',
    'api::department.department.findOne',
    'api::subdivision.subdivision.find',
    'api::subdivision.subdivision.findOne',
  ];

  for (const action of actions) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { role: role.id, action } });

    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          role: role.id,
          action,
          enabled: true,
        },
      });
      continue;
    }

    if (!existing.enabled) {
      await strapi.db.query('plugin::users-permissions.permission').update({
        where: { id: existing.id },
        data: { enabled: true },
      });
    }
  }
}

async function seedDocumentTypes(strapi: any) {
  const types = ['Табель', 'Отчёт', 'Тестирование'];
  for (const name of types) {
    try {
      const existing = await (strapi.entityService as any).findMany(
        'api::document-type.document-type',
        { filters: { name }, limit: 1 }
      );
      const list = Array.isArray(existing) ? existing : [];
      if (list.length === 0) {
        await (strapi.entityService as any).create('api::document-type.document-type', {
          data: { name },
        });
        console.log(`📋 Seeded document type: ${name}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to seed document type "${name}":`, err);
    }
  }
}

const generateDocumentUid = () => randomBytes(5).toString('hex').toUpperCase();

async function backfillDocumentUids(strapi: any) {
  try {
    const pageSize = 200;
    let totalUpdated = 0;

    while (true) {
      const batch = await strapi.db.query('api::document.document').findMany({
        where: { uid: { $null: true } },
        select: ['id'],
        limit: pageSize,
      });

      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const row of batch) {
        let attempt = 0;
        while (attempt < 3) {
          try {
            await strapi.db.query('api::document.document').update({
              where: { id: row.id },
              data: { uid: generateDocumentUid() },
            });
            totalUpdated += 1;
            break;
          } catch (error: any) {
            attempt += 1;
            if (attempt >= 3) {
              strapi.log.warn(
                `[document-uid] Could not assign uid for document ${row.id}: ${error?.message || error}`
              );
            }
          }
        }
      }

      if (batch.length < pageSize) break;
    }

    if (totalUpdated > 0) {
      strapi.log.info(`[document-uid] Backfilled uid for ${totalUpdated} documents`);
    }
  } catch (error: any) {
    strapi.log.warn(`[document-uid] Backfill failed: ${error?.message || error}`);
  }
}

async function syncUsersFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  const token = process.env.INTERNAL_SYNC_TOKEN;
  if (!pmUrl) return;
  if (!token) {
    console.warn('⚠️ INTERNAL_SYNC_TOKEN not set — skipping user sync from server-pm');
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${pmUrl}/api/internal-sync/users`,
      { signal: ctrl.signal, headers: { 'X-Internal-Token': token } }
    ).finally(() => clearTimeout(t));
    if (!res.ok) {
      console.warn(`⚠️ sync users: HTTP ${res.status} from ${pmUrl}`);
      return;
    }
    const items: any[] = (await res.json()) as any[];
    if (!Array.isArray(items) || items.length === 0) {
      console.warn('⚠️ sync users: empty list from server-pm');
      return;
    }

    const authRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });
    if (!authRole) {
      console.warn('⚠️ sync users: no authenticated role found');
      return;
    }

    let created = 0;
    let updated = 0;
    for (const pmUser of items) {
      const email = String(pmUser?.email || '').toLowerCase().trim();
      if (!email) continue;
      const username = String(pmUser?.username || email).trim();
      const fullName = String(pmUser?.fullName || '').trim();
      const position = String(pmUser?.position || '').trim();
      const deptName = String(pmUser?.department?.name_ru || '').trim();
      const deptKey = String(pmUser?.department?.key || '').trim();
      const isKpiResponsible = Boolean(pmUser?.isKpiResponsible);
      const isSuperAdmin = Boolean(pmUser?.isSuperAdmin);

      let departmentId: number | null = null;
      if (deptKey) {
        const dept = await strapi.db
          .query('api::department.department')
          .findOne({ where: { key: deptKey } });
        departmentId = dept?.id || null;
      }
      if (!departmentId && deptName) {
        const dept = await strapi.db
          .query('api::department.department')
          .findOne({ where: { name: deptName } });
        departmentId = dept?.id || null;
      }

      const existing = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email }, populate: ['department'] });

      if (!existing) {
        await (strapi.entityService as any).create('plugin::users-permissions.user', {
          data: {
            username,
            email,
            fullName,
            position,
            department: departmentId,
            isKpiResponsible,
            isSuperAdmin,
            provider: 'local',
            password: `kc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
            confirmed: true,
            blocked: false,
            role: authRole.id,
          },
        });
        created += 1;
      } else {
        const patch: Record<string, any> = {};
        const existingDepartmentId = Number(existing?.department?.id || existing?.department || 0) || null;
        if (fullName && fullName !== existing.fullName) patch.fullName = fullName;
        if (position !== String(existing.position || '')) patch.position = position;
        if ((departmentId || null) !== existingDepartmentId) patch.department = departmentId;
        if (isKpiResponsible !== existing.isKpiResponsible) patch.isKpiResponsible = isKpiResponsible;
        if (isSuperAdmin !== existing.isSuperAdmin) patch.isSuperAdmin = isSuperAdmin;
        if (Object.keys(patch).length > 0) {
          await strapi.entityService.update('plugin::users-permissions.user', existing.id, {
            data: patch,
          });
          updated += 1;
        }
      }
    }
    console.log(`👥 Users synced from server-pm: +${created} created, ${updated} updated`);
  } catch (err) {
    console.warn('⚠️ Failed to sync users from server-pm:', err);
  }
}

async function syncDepartmentsFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  const token = process.env.INTERNAL_SYNC_TOKEN;
  if (!pmUrl) {
    console.warn('⚠️ SERVER_PM_URL not set — skipping department sync from server-pm');
    return;
  }
  if (!token) {
    console.warn('⚠️ INTERNAL_SYNC_TOKEN not set — skipping department sync from server-pm');
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${pmUrl}/api/internal-sync/departments`,
      { signal: ctrl.signal, headers: { 'X-Internal-Token': token } }
    ).finally(() => clearTimeout(t));
    if (!res.ok) {
      console.warn(`⚠️ sync departments: HTTP ${res.status} from ${pmUrl}`);
      return;
    }
    const json: any = await res.json();
    const items: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    if (items.length === 0) {
      console.warn('⚠️ sync departments: empty list from server-pm');
      return;
    }
    let created = 0;
    let updated = 0;
    for (const item of items) {
      const attrs = item?.attributes || item;
      const name = String(attrs?.name_ru || '').trim();
      const key = String(attrs?.key || '').trim();
      if (!name) continue;
      let list: any[] = [];
      if (key) {
        const byKey = await (strapi.entityService as any).findMany(
          'api::department.department',
          { filters: { key }, limit: 1 }
        );
        list = Array.isArray(byKey) ? byKey : [];
      }
      if (list.length === 0) {
        const byName = await (strapi.entityService as any).findMany(
          'api::department.department',
          { filters: { name }, limit: 1 }
        );
        list = Array.isArray(byName) ? byName : [];
      }
      if (list.length === 0) {
        await (strapi.entityService as any).create('api::department.department', {
          data: { name, key: key || null },
        });
        created += 1;
      } else {
        const patch: Record<string, any> = {};
        if (name && list[0]?.name !== name) patch.name = name;
        if (key && list[0]?.key !== key) patch.key = key;
        if (Object.keys(patch).length > 0) {
          await strapi.entityService.update('api::department.department', list[0].id, {
            data: patch,
          });
        }
        updated += 1;
      }
    }
    console.log(`🏢 Departments synced from server-pm: +${created} created, ${updated} existing`);
  } catch (err) {
    console.warn('⚠️ Failed to sync departments from server-pm:', err);
  }
}

function isRadiologyDepartment(dept: any): boolean {
  const key = String(dept?.key || '').trim().toUpperCase();
  const name = String(dept?.name || '').trim().toLowerCase();
  return (
    key === RADIOLOGY_DEPARTMENT.key ||
    key.includes('RADIOLOGY') ||
    name.includes('лучевая') ||
    name.includes('лучевой')
  );
}

async function moveSignDocDepartmentRelations(strapi: any, fromId: number, toId: number) {
  const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
    filters: { department: { id: fromId } },
    pagination: { pageSize: 1000 },
  });
  for (const user of users || []) {
    await strapi.entityService.update('plugin::users-permissions.user', user.id, {
      data: { department: toId },
    });
  }

  const subdivisions = await strapi.entityService.findMany('api::subdivision.subdivision', {
    filters: { department: { id: fromId } },
    pagination: { pageSize: 1000 },
  });
  for (const subdivision of subdivisions || []) {
    await strapi.entityService.update('api::subdivision.subdivision', subdivision.id, {
      data: { department: toId },
    });
  }
}

async function mergeRadiologyDepartments(strapi: any) {
  const departments = await strapi.entityService.findMany('api::department.department', {
    pagination: { pageSize: 1000 },
  });
  const list = Array.isArray(departments) ? departments : [];
  const canonical =
    list.find((dept: any) => String(dept?.key || '').toUpperCase() === RADIOLOGY_DEPARTMENT.key) ||
    list.find((dept: any) => String(dept?.name || '').trim().toLowerCase() === RADIOLOGY_DEPARTMENT.name.toLowerCase()) ||
    list.find(isRadiologyDepartment);

  if (!canonical?.id) {
    await strapi.entityService.create('api::department.department', {
      data: RADIOLOGY_DEPARTMENT,
    });
    return;
  }

  const duplicates = list.filter(
    (dept: any) => Number(dept.id) !== Number(canonical.id) && isRadiologyDepartment(dept)
  );
  for (const duplicate of duplicates) {
    await moveSignDocDepartmentRelations(strapi, duplicate.id, canonical.id);
    try {
      await strapi.entityService.delete('api::department.department', duplicate.id);
      strapi.log.info(`[departments] Merged and deleted duplicate SignDoc radiology department ${duplicate.id}`);
    } catch (error: any) {
      strapi.log.warn(
        `[departments] Could not delete duplicate SignDoc radiology department ${duplicate.id}: ${error?.message || error}`
      );
    }
  }

  await strapi.entityService.update('api::department.department', canonical.id, {
    data: RADIOLOGY_DEPARTMENT,
  });
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    await lockPublicRole(strapi);
    await ensureAuthenticatedPermissions(strapi);
    await seedDocumentTypes(strapi);
    await backfillDocumentUids(strapi);
    await syncDepartmentsFromPm(strapi);
    await mergeRadiologyDepartments(strapi);
    await syncUsersFromPm(strapi);
  },
};
