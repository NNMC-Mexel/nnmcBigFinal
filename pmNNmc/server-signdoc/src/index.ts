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
  },
};
