'use strict';

const seedData = async () => {
  const strapi = global.strapi;

  console.log('🌱 Starting seed...');

  // 1. Seed Departments
  console.log('📁 Creating departments...');
  const departments = [
    { key: 'IT', name_ru: 'Отдел IT', name_kz: 'IT бөлімі' },
    { key: 'DIGITALIZATION', name_ru: 'Отдел цифровизации', name_kz: 'Цифрландыру бөлімі' },
  ];

  const createdDepartments = {};
  for (const dept of departments) {
    const existing = await strapi.entityService.findMany('api::department.department', {
      filters: { key: dept.key },
    });

    if (existing.length === 0) {
      const created = await strapi.entityService.create('api::department.department', {
        data: dept,
      });
      createdDepartments[dept.key] = created;
      console.log(`  ✅ Created department: ${dept.name_ru}`);
    } else {
      createdDepartments[dept.key] = existing[0];
      console.log(`  ⚠️ Department exists: ${dept.name_ru}`);
    }
  }

  // 2. Seed Users
  console.log('👥 Creating users...');

  const roles = await strapi.entityService.findMany('plugin::users-permissions.role');
  const normalizeRole = (value) => value.toLowerCase().replace(/\s+/g, '').replace(/[_-]/g, '');
  const findRole = (candidates) =>
    roles.find((role) => {
      const roleName = normalizeRole(role.name || '');
      const roleType = normalizeRole(role.type || '');
      return candidates.some((candidate) => roleName.includes(candidate) || roleType.includes(candidate));
    });

  const leadRole = findRole(['lead', 'руководитель']);
  const memberRole = findRole(['member', 'authenticated']);
  const fallbackRole = roles[0];
  const resolveRoleId = (role) => (role || memberRole || fallbackRole)?.id;

  const usersToSeed = [
    {
      key: 'IT_LEAD',
      username: 'it.lead',
      email: 'it.lead@example.com',
      firstName: 'IT',
      lastName: 'Lead',
      departmentKey: 'IT',
      roleId: resolveRoleId(leadRole),
    },
    {
      key: 'DIGITAL_LEAD',
      username: 'digital.lead',
      email: 'digital.lead@example.com',
      firstName: 'Digital',
      lastName: 'Lead',
      departmentKey: 'DIGITALIZATION',
      roleId: resolveRoleId(leadRole),
    },
    {
      key: 'IT_MEMBER',
      username: 'it.member',
      email: 'it.member@example.com',
      firstName: 'IT',
      lastName: 'Member',
      departmentKey: 'IT',
      roleId: resolveRoleId(memberRole),
    },
    {
      key: 'DIGITAL_MEMBER',
      username: 'digital.member',
      email: 'digital.member@example.com',
      firstName: 'Digital',
      lastName: 'Member',
      departmentKey: 'DIGITALIZATION',
      roleId: resolveRoleId(memberRole),
    },
  ];

  const createdUsers = {};

  for (const seedUser of usersToSeed) {
    const existing = await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: {
        $or: [{ email: seedUser.email }, { username: seedUser.username }],
      },
    });

    let user = existing[0];
    if (!user) {
      user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          email: seedUser.email,
          username: seedUser.username,
          firstName: seedUser.firstName,
          lastName: seedUser.lastName,
          password: 'Password123!',
          role: seedUser.roleId,
          department: createdDepartments[seedUser.departmentKey]?.id,
          confirmed: true,
          blocked: false,
          provider: 'local',
        },
      });
      console.log(`  ✅ Created user: ${seedUser.email}`);
    } else {
      console.log(`  ⚠️ User exists: ${seedUser.email}`);
    }

    createdUsers[seedUser.key] = user;
  }

  // 3. Seed BoardStages
  console.log('📊 Creating board stages...');
  const stages = [
    {
      name_ru: 'Идеи / Запросы',
      name_kz: 'Идеялар / Сұраныстар',
      minPercent: 0,
      maxPercent: 10,
      order: 1,
      color: '#64748B',
    },
    {
      name_ru: 'Подготовка к проекту (ТЗ, аналитика)',
      name_kz: 'Жобаға дайындық (ТТ, талдау)',
      minPercent: 10,
      maxPercent: 20,
      order: 2,
      color: '#0EA5E9',
    },
    {
      name_ru: 'В работе',
      name_kz: 'Жұмыста',
      minPercent: 20,
      maxPercent: 70,
      order: 3,
      color: '#F97316',
    },
    {
      name_ru: 'Тестирование',
      name_kz: 'Тестілеу',
      minPercent: 70,
      maxPercent: 90,
      order: 4,
      color: '#EAB308',
    },
    {
      name_ru: 'В промышленной эксплуатации',
      name_kz: 'Өнеркәсіптік пайдалануда',
      minPercent: 90,
      maxPercent: 101,
      order: 5,
      color: '#22C55E',
    },
  ];

  const createdStages = [];
  for (const stage of stages) {
    const existing = await strapi.entityService.findMany('api::board-stage.board-stage', {
      filters: { order: stage.order },
    });

    if (existing.length === 0) {
      const created = await strapi.entityService.create('api::board-stage.board-stage', {
        data: stage,
      });
      createdStages.push(created);
      console.log(`  ✅ Created stage: ${stage.name_ru}`);
    } else {
      const existingStage = existing[0];
      const updated = await strapi.entityService.update('api::board-stage.board-stage', existingStage.id, {
        data: stage,
      });
      createdStages.push(updated);
      console.log(`  🔄 Updated stage: ${stage.name_ru}`);
    }
  }

  // 4. Seed sample projects
  console.log('🚀 Creating sample projects...');

  const fallbackOwnerId =
    createdUsers.IT_LEAD?.id ||
    createdUsers.DIGITAL_LEAD?.id ||
    createdUsers.IT_MEMBER?.id ||
    createdUsers.DIGITAL_MEMBER?.id;

  if (!fallbackOwnerId) {
    throw new Error('Seed users were not created');
  }

  const itOwnerId = createdUsers.IT_LEAD?.id || fallbackOwnerId;
  const digitalOwnerId = createdUsers.DIGITAL_LEAD?.id || fallbackOwnerId;
  const itSupportingId = createdUsers.IT_MEMBER?.id || createdUsers.IT_LEAD?.id;
  const digitalSupportingId = createdUsers.DIGITAL_MEMBER?.id || createdUsers.DIGITAL_LEAD?.id;

  const sampleProjects = [
    {
      title: 'Внедрение МИС "Damumed"',
      description: 'Интеграция медицинской информационной системы во все подразделения',
      department: createdDepartments['DIGITALIZATION'].id,
      startDate: '2024-01-15',
      dueDate: '2024-06-30',
      status: 'ACTIVE',
      priorityLight: 'RED',
      owner: digitalOwnerId,
      supportingSpecialists: [digitalSupportingId].filter(Boolean),
      tasks: [
        { title: 'Анализ требований', completed: true, order: 1 },
        { title: 'Настройка серверной инфраструктуры', completed: false, order: 2 },
        { title: 'Миграция данных пациентов', completed: false, order: 3 },
        { title: 'Обучение персонала', completed: false, order: 4 },
        { title: 'Тестирование', completed: false, order: 5 },
      ],
    },
    {
      title: 'Обновление сетевой инфраструктуры',
      description: 'Замена коммутаторов и прокладка нового кабеля',
      department: createdDepartments['IT'].id,
      startDate: '2024-02-01',
      dueDate: '2024-04-15',
      status: 'ACTIVE',
      priorityLight: 'YELLOW',
      owner: itOwnerId,
      supportingSpecialists: [itSupportingId].filter(Boolean),
      tasks: [
        { title: 'Закупка оборудования', completed: true, order: 1 },
        { title: 'Монтаж кабельной системы', completed: true, order: 2 },
        { title: 'Настройка VLAN', completed: true, order: 3 },
        { title: 'Тестирование скорости', completed: false, order: 4 },
      ],
    },
    {
      title: 'Разработка портала пациента',
      description: 'Личный кабинет для записи на приём и просмотра результатов',
      department: createdDepartments['DIGITALIZATION'].id,
      startDate: '2024-03-01',
      dueDate: '2024-12-31',
      status: 'ACTIVE',
      priorityLight: 'GREEN',
      owner: digitalOwnerId,
      supportingSpecialists: [digitalSupportingId].filter(Boolean),
      tasks: [
        { title: 'UI/UX дизайн', completed: true, order: 1 },
        { title: 'Разработка API', completed: false, order: 2 },
        { title: 'Фронтенд разработка', completed: false, order: 3 },
        { title: 'Интеграция с МИС', completed: false, order: 4 },
        { title: 'Безопасность и GDPR', completed: false, order: 5 },
        { title: 'Мобильная версия', completed: false, order: 6 },
      ],
    },
    {
      title: 'Система видеонаблюдения',
      description: 'Установка IP-камер и сервера видеоархива',
      department: createdDepartments['IT'].id,
      startDate: '2024-01-01',
      dueDate: '2024-03-01',
      status: 'ARCHIVED',
      priorityLight: 'GREEN',
      owner: itOwnerId,
      supportingSpecialists: [itSupportingId].filter(Boolean),
      tasks: [
        { title: 'Проектирование системы', completed: true, order: 1 },
        { title: 'Закупка камер', completed: true, order: 2 },
        { title: 'Монтаж', completed: true, order: 3 },
        { title: 'Настройка NVR', completed: true, order: 4 },
      ],
    },
    {
      title: 'Модернизация ЦОД',
      description: 'Обновление серверного оборудования и СХД',
      department: createdDepartments['IT'].id,
      startDate: '2024-04-01',
      dueDate: '2024-08-31',
      status: 'ACTIVE',
      priorityLight: 'RED',
      owner: itOwnerId,
      supportingSpecialists: [itSupportingId].filter(Boolean),
      tasks: [
        { title: 'Аудит текущего оборудования', completed: true, order: 1 },
        { title: 'Составление ТЗ', completed: true, order: 2 },
        { title: 'Тендерные процедуры', completed: false, order: 3 },
        { title: 'Поставка оборудования', completed: false, order: 4 },
        { title: 'Миграция сервисов', completed: false, order: 5 },
      ],
    },
    {
      title: 'Archived: Legacy Intranet Cleanup',
      description: 'Historical project kept for reference in the archive column.',
      department: createdDepartments['DIGITALIZATION'].id,
      startDate: '2023-01-10',
      dueDate: '2023-06-30',
      status: 'ARCHIVED',
      priorityLight: 'GREEN',
      owner: digitalOwnerId,
      supportingSpecialists: [digitalSupportingId].filter(Boolean),
      tasks: [
        { title: 'Audit legacy pages', completed: true, order: 1 },
        { title: 'Deprecate old integrations', completed: true, order: 2 },
        { title: 'Publish archive notes', completed: true, order: 3 },
      ],
    },

  ];

  for (const projectData of sampleProjects) {
    const { tasks, ...projectFields } = projectData;

    const existing = await strapi.entityService.findMany('api::project.project', {
      filters: { title: projectFields.title },
    });

    if (existing.length === 0) {
      const project = await strapi.entityService.create('api::project.project', {
        data: projectFields,
      });

      // Create tasks
      for (const task of tasks) {
        await strapi.entityService.create('api::task.task', {
          data: {
            ...task,
            project: project.id,
          },
        });
      }

      console.log(`  ✅ Created project: ${projectFields.title} with ${tasks.length} tasks`);
    } else {
      console.log(`  ⚠️ Project exists: ${projectFields.title}`);
    }
  }

  console.log('✅ Seed completed!');
};

module.exports = { default: seedData };
