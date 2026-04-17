// import type { Core } from '@strapi/strapi';

async function ensureAuthenticatedPermissions(strapi: any) {
  const role = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  if (!role) return;

  const actions = [
    'api::kpi-calculator.kpi-calculator.calculate',
    'api::kpi-calculator.kpi-calculator.downloadExcel',
    'api::kpi-calculator.kpi-calculator.download1C',
    'api::kpi-calculator.kpi-calculator.downloadBuh',
    'api::kpi-calculator.kpi-calculator.downloadBuhPdf',
    'api::kpi-calculator.kpi-calculator.downloadReport',
    'api::kpi-calculator.kpi-calculator.generatePdfFromResults',
    'api::calculation-archive.calculation-archive.find',
    'api::calculation-archive.calculation-archive.findOne',
    'api::calculation-archive.calculation-archive.delete',
    'api::department-template.department-template.find',
    'api::department-template.department-template.findOne',
    'api::department-template.department-template.create',
    'api::department-template.department-template.update',
    'api::department-template.department-template.delete',
  ];

  for (const action of actions) {
    const existing = await strapi
      .query('plugin::users-permissions.permission')
      .findOne({ where: { role: role.id, action } });

    if (!existing) {
      await strapi.query('plugin::users-permissions.permission').create({
        data: {
          role: role.id,
          action,
          enabled: true,
        },
      });
      continue;
    }

    if (!existing.enabled) {
      await strapi.query('plugin::users-permissions.permission').update({
        where: { id: existing.id },
        data: { enabled: true },
      });
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
    await ensureAuthenticatedPermissions(strapi);
  },
};
