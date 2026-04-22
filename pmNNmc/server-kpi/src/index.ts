// import type { Core } from '@strapi/strapi';

async function syncUsersFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  if (!pmUrl) {
    console.warn('⚠️ SERVER_PM_URL not set — skipping user sync from server-pm');
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${pmUrl}/api/users?pagination[pageSize]=500`,
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
    for (const pmUser of items) {
      const email = String(pmUser?.email || '').toLowerCase().trim();
      if (!email) continue;
      const username = String(pmUser?.username || email).trim();

      const existing = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({ where: { email } });

      if (!existing) {
        try {
          await (strapi.entityService as any).create('plugin::users-permissions.user', {
            data: {
              username,
              email,
              provider: 'keycloak',
              password: `kc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
              confirmed: true,
              blocked: false,
              role: authRole.id,
              allowedDepartments: [],
            },
          });
          created += 1;
        } catch (e: any) {
          console.warn(`⚠️ sync users: failed to create ${email}:`, e?.message || e);
        }
      }
    }
    console.log(`👥 Users synced from server-pm: +${created} created`);
  } catch (err) {
    console.warn('⚠️ Failed to sync users from server-pm:', err);
  }
}

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
    'api::kpi-calculator.kpi-calculator.recalculate',
    'api::calculation-archive.calculation-archive.find',
    'api::calculation-archive.calculation-archive.findOne',
    'api::calculation-archive.calculation-archive.create',
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
    await syncUsersFromPm(strapi);
  },
};
