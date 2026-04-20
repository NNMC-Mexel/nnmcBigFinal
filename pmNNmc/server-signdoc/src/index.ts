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

async function syncDepartmentsFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL || 'http://192.168.101.25:12010';
  try {
    const res = await fetch(
      `${pmUrl}/api/departments?pagination[pageSize]=500&fields[0]=name_ru&fields[1]=name_kz&fields[2]=key`
    );
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
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

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
  },
};
