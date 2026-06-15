// import type { Core } from '@strapi/strapi';

const RADIOLOGY_PROTOCOL_TEMPLATE = {
  departmentKey: 'RADIOLOGY',
  departmentName: 'Лучевая',
  meetingTitle: 'Протокол ОЦМК по KPI отдела лучевой диагностики',
  place: 'ННМЦ',
  agendaText: 'Рассмотрение результатов KPI отдела лучевой диагностики.',
  footerText: '',
  secretaryName: '',
  coordinatorRole: '',
  commissionMembers: [
    {
      role: 'Лучевая диагностика',
      name: 'Оразбекова Жанар Оримбековна',
      email: 'orazbekova.z@nnmc.kz',
      order: 1,
    },
    {
      role: 'Отдел управления персоналом',
      name: 'Елеусизова Ляззат Сарановна',
      email: 'eleusizova.l@nnmc.kz',
      order: 2,
    },
    {
      role: 'Лучевая диагностика',
      name: 'Михайлов Азат Игоревич',
      email: 'mikhailov.a@nnmc.kz',
      order: 3,
    },
    {
      role: 'Экономика',
      name: 'Айтымбетова Гульмира Меирбековна',
      email: 'aitymbetova.g@nnmc.kz',
      order: 4,
    },
    {
      role: 'Отдел управления персоналом',
      name: 'Кенжебаева Шайзат Тукеновна',
      email: 'kenzhebaeva.s@nnmc.kz',
      order: 5,
    },
    {
      role: 'Клинико-фармакологический отдел',
      name: 'Кушенова Сауле Жолдасбековна',
      email: 'kushenova.s@nnmc.kz',
      order: 6,
    },
    {
      role: 'Служба поддержки пациента и внутренней экспертизы',
      name: 'Куржукова Асель Куанышевна',
      email: 'kurzhukova.a@nnmc.kz',
      order: 7,
    },
    {
      role: 'Служба поддержки пациента и внутренней экспертизы',
      name: 'Ачкасов Владислав Борисович',
      email: 'achkasov.v@nnmc.kz',
      order: 8,
    },
    {
      role: 'Администрация',
      name: 'Жумагулов Алмат Бахчанович',
      email: 'zhumagulov.a@nnmc.kz',
      order: 9,
    },
    {
      role: 'Экономика',
      name: 'Мендыбаева Эльмира Манаповна',
      email: 'mendybaeva.e@nnmc.kz',
      order: 10,
    },
    {
      role: 'Бухгалтерия',
      name: 'Тасеменова Дарига Кошкарбаевна',
      email: 'tasemenova.d@nnmc.kz',
      order: 11,
    },
  ],
};

const OCMK_COMMISSION_MEMBERS = [
  {
    role: 'Председатель',
    name: 'Нурсейтова Толкын Бауезовна',
    email: 'nurseitova.t@nnmc.kz',
    order: 1,
  },
  {
    role: 'Координатор ОЦМК',
    name: 'Кикимбаева Гульнара Тулешевна',
    email: 'kikimbaeva.g@nnmc.kz',
    order: 2,
  },
  {
    role: 'Руководитель по сестринскому делу',
    name: 'Мусабаева Айна Муратовна',
    email: 'musabaeva.a@nnmc.kz',
    order: 3,
  },
  {
    role: 'Руководитель отдела управления',
    name: 'Кенжебаева Шайзат Тукеновна',
    email: 'kenzhebaeva.s@nnmc.kz',
    order: 4,
  },
  {
    role: 'Главный экономист',
    name: 'Мендыбаева Эльмира Манаповна',
    email: 'mendybaeva.e@nnmc.kz',
    order: 5,
  },
  {
    role: 'Главный бухгалтер',
    name: 'Тасеменова Дарига Кошкарбаевна',
    email: 'tasemenova.d@nnmc.kz',
    order: 6,
  },
  {
    role: 'Секретарь комиссии',
    name: 'Актанова К.Е.',
    email: 'aktanova.k@nnmc.kz',
    order: 7,
  },
];

const OCMK_PROTOCOL_BASE = {
  protocolNumber: '1',
  meetingTitle: 'Заседания комиссии по оплате и мотивации труда персонала',
  place: 'г.Астана, пр.Абылай – хана 42',
  agendaText:
    'Рассмотрение итогов работы за {{month}} месяц {{year}} года. Оценка достижения ключевых показателей работы эффективности выполнения внутренних стандартов, санитарно-эпидемиологического режима и трудовой дисциплины, степень достижения КПР каждым сотрудником {{department}}.\n' +
    'Результаты фактического исполнения целевых показателей КПР за {{month}} месяц {{year}} года в соответствии с утверждённым Положением об оплате труда. Младший медицинский персонал {{department}}.',
  footerText:
    'Передать отделу бухгалтерии результаты рассмотрения стимулирующих и мотивирующих компонентов для своевременного начисления.',
  secretaryName: '',
  coordinatorRole: 'Координатор ОЦМК',
  commissionMembers: OCMK_COMMISSION_MEMBERS,
};

const OCMK_PROTOCOL_TEMPLATES = ['ОЦМК-1', 'ОЦМК-2', 'ОЦМК-3'].map((departmentName) => ({
  ...OCMK_PROTOCOL_BASE,
  departmentKey: departmentName,
  departmentName,
}));

const KPI_PROTOCOL_TEMPLATES = [
  RADIOLOGY_PROTOCOL_TEMPLATE,
  ...OCMK_PROTOCOL_TEMPLATES,
];

function isLegacyRadiologyDepartmentName(value: any): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('лучев') && (normalized.includes('вмп') || normalized.includes('смп'));
}

async function syncUsersFromPm(strapi: any) {
  const pmUrl = process.env.SERVER_PM_URL;
  const token = process.env.INTERNAL_SYNC_TOKEN;
  if (!pmUrl) {
    console.warn('⚠️ SERVER_PM_URL not set — skipping user sync from server-pm');
    return;
  }
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
      const isKpiResponsible = Boolean(pmUser?.isKpiResponsible);
      const isSuperAdmin = Boolean(pmUser?.isSuperAdmin);
      const departmentKey = String(pmUser?.department?.key || '').trim();
      const departmentName = String(pmUser?.department?.name_ru || '').trim();

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
              departmentKey,
              departmentName,
              isKpiResponsible,
              isSuperAdmin,
            },
          });
          created += 1;
        } catch (e: any) {
          console.warn(`⚠️ sync users: failed to create ${email}:`, e?.message || e);
        }
      } else {
        const patch: Record<string, any> = {};
        if (isKpiResponsible !== existing.isKpiResponsible) patch.isKpiResponsible = isKpiResponsible;
        if (isSuperAdmin !== existing.isSuperAdmin) patch.isSuperAdmin = isSuperAdmin;
        if (departmentKey !== existing.departmentKey) patch.departmentKey = departmentKey;
        if (departmentName !== existing.departmentName) patch.departmentName = departmentName;
        if (Object.keys(patch).length > 0) {
          try {
            await strapi.entityService.update('plugin::users-permissions.user', existing.id, {
              data: patch,
            });
            updated += 1;
          } catch {}
        }
      }
    }
    console.log(`👥 Users synced from server-pm: +${created} created, ${updated} updated`);
  } catch (err) {
    console.warn('⚠️ Failed to sync users from server-pm:', err);
  }
}

// Public role must be empty: no public access to KPI data.
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
    console.log(`🔒 Public role locked: removed ${removed} permissions in server-kpi`);
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
    'api::onec-employee.onec-employee.list',
    'api::onec-timesheet.onec-timesheet.list',
    'api::onec-timesheet.onec-timesheet.download',
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

async function seedKpiProtocolTemplates(strapi: any) {
  try {
    for (const template of KPI_PROTOCOL_TEMPLATES) {
      const existing = await strapi.entityService.findMany(
        'api::department-template.department-template',
        {
          filters: { departmentKey: template.departmentKey },
          limit: 1,
        }
      );

      if (!Array.isArray(existing) || existing.length === 0) {
        await strapi.entityService.create('api::department-template.department-template', {
          data: template,
        });
        strapi.log.info(`[department-template] Seeded ${template.departmentKey} KPI protocol template`);
        continue;
      }

      await strapi.entityService.update(
        'api::department-template.department-template',
        existing[0].id,
        { data: template }
      );
      strapi.log.info(`[department-template] Updated ${template.departmentKey} KPI protocol template`);
    }
  } catch (error: any) {
    strapi.log.warn(`[department-template] KPI seed failed: ${error?.message || error}`);
  }
}

async function normalizeRadiologyKpiData(strapi: any) {
  try {
    const employees = await strapi.entityService.findMany('api::employee.employee', {
      pagination: { pageSize: 1000 },
    });
    let employeeUpdates = 0;
    for (const employee of employees || []) {
      if (!isLegacyRadiologyDepartmentName((employee as any).department)) continue;
      await strapi.entityService.update('api::employee.employee', (employee as any).id, {
        data: { department: RADIOLOGY_PROTOCOL_TEMPLATE.departmentName },
      });
      employeeUpdates += 1;
    }

    const archives = await strapi.entityService.findMany(
      'api::calculation-archive.calculation-archive',
      { pagination: { pageSize: 1000 } }
    );
    let archiveUpdates = 0;
    for (const archive of archives || []) {
      if (!isLegacyRadiologyDepartmentName((archive as any).department)) continue;
      await strapi.entityService.update(
        'api::calculation-archive.calculation-archive',
        (archive as any).id,
        { data: { department: RADIOLOGY_PROTOCOL_TEMPLATE.departmentName } }
      );
      archiveUpdates += 1;
    }

    const templates = await strapi.entityService.findMany(
      'api::department-template.department-template',
      { pagination: { pageSize: 1000 } }
    );
    for (const template of templates || []) {
      const key = String((template as any).departmentKey || '').trim().toUpperCase();
      const name = String((template as any).departmentName || '').trim();
      if (
        key !== RADIOLOGY_PROTOCOL_TEMPLATE.departmentKey &&
        (key.includes('RADIOLOGY') || isLegacyRadiologyDepartmentName(name))
      ) {
        await strapi.entityService.delete(
          'api::department-template.department-template',
          (template as any).id
        );
      }
    }

    if (employeeUpdates || archiveUpdates) {
      strapi.log.info(
        `[radiology-normalize] KPI data moved to Лучевая: ${employeeUpdates} employees, ${archiveUpdates} archives`
      );
    }
  } catch (error: any) {
    strapi.log.warn(`[radiology-normalize] failed: ${error?.message || error}`);
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
    await lockPublicRole(strapi);
    await ensureAuthenticatedPermissions(strapi);
    await syncUsersFromPm(strapi);
    await seedKpiProtocolTemplates(strapi);
    await normalizeRadiologyKpiData(strapi);
  },
};
