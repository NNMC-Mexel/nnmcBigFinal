// import type { Core } from '@strapi/strapi';

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

async function syncUsersFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  if (!pmUrl) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${pmUrl}/api/users?populate=department&pagination[pageSize]=500`,
      { signal: ctrl.signal }
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
      const deptName = String(pmUser?.department?.name_ru || '').trim();

      let departmentId: number | null = null;
      if (deptName) {
        const dept = await strapi.db
          .query('api::department.department')
          .findOne({ where: { name: deptName } });
        departmentId = dept?.id || null;
      }

      const existing = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email } });

      if (!existing) {
        await (strapi.entityService as any).create('plugin::users-permissions.user', {
          data: {
            username,
            email,
            fullName,
            department: departmentId,
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
        if (fullName && fullName !== existing.fullName) patch.fullName = fullName;
        if (departmentId && existing.department !== departmentId) patch.department = departmentId;
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
  if (!pmUrl) {
    console.warn('⚠️ SERVER_PM_URL not set — skipping department sync from server-pm');
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${pmUrl}/api/departments?pagination[pageSize]=500&fields[0]=name_ru&fields[1]=name_kz&fields[2]=key`,
      { signal: ctrl.signal }
    ).finally(() => clearTimeout(t));
    if (!res.ok) {
      console.warn(`⚠️ sync departments: HTTP ${res.status} from ${pmUrl}`);
      return;
    }
    const json: any = await res.json();
    const items: any[] = Array.isArray(json?.data) ? json.data : [];
    if (items.length === 0) {
      console.warn('⚠️ sync departments: empty list from server-pm');
      return;
    }
    let created = 0;
    let updated = 0;
    for (const item of items) {
      const attrs = item?.attributes || item;
      const name = String(attrs?.name_ru || '').trim();
      if (!name) continue;
      const existing = await (strapi.entityService as any).findMany(
        'api::department.department',
        { filters: { name }, limit: 1 }
      );
      const list = Array.isArray(existing) ? existing : [];
      if (list.length === 0) {
        await (strapi.entityService as any).create('api::department.department', {
          data: { name },
        });
        created += 1;
      } else {
        updated += 1;
      }
    }
    console.log(`🏢 Departments synced from server-pm: +${created} created, ${updated} existing`);
  } catch (err) {
    console.warn('⚠️ Failed to sync departments from server-pm:', err);
  }
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: any }) {
    strapi.db.lifecycles.subscribe({
      models: ['plugin::upload.file'],
      async afterCreate(event: any) {
        const f = event.result;
        console.log(
          `[upload-debug] afterCreate id=${f?.id} documentId=${f?.documentId} hash=${f?.hash} url=${f?.url} name=${f?.name} size=${f?.size}`
        );
      },
      async afterUpdate(event: any) {
        const f = event.result;
        console.log(
          `[upload-debug] afterUpdate id=${f?.id} hash=${f?.hash} url=${f?.url} name=${f?.name}`
        );
      },
    });
    strapi.db.lifecycles.subscribe({
      models: ['api::document.document'],
      async afterCreate(event: any) {
        const d = event.result;
        const p = event.params?.data || {};
        console.log(
          `[doc-debug] afterCreate docId=${d?.documentId} id=${d?.id} title=${d?.title} currentFile(param)=${JSON.stringify(p.currentFile)} originalFile(param)=${JSON.stringify(p.originalFile)}`
        );
      },
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    await seedDocumentTypes(strapi);
    await syncDepartmentsFromPm(strapi);
    await syncUsersFromPm(strapi);
  },
};
