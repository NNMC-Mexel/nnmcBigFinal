/**
 * Seed script для NNMC IT Project Board
 * Создаёт начальные данные: отделы, стадии, тестовые проекты, helpdesk данные
 */

const seedData = async () => {
  const strapi = (global as any).strapi;

  console.log('🌱 Starting seed...');

  // 1. Seed Departments
  console.log('📁 Creating departments...');
  const departments = [
    { key: 'IT', name_ru: 'Отдел IT', name_kz: 'IT бөлімі' },
    { key: 'DIGITALIZATION', name_ru: 'Отдел цифровизации', name_kz: 'Цифрландыру бөлімі' },
    { key: 'MEDICAL_EQUIPMENT', name_ru: 'Служба медицинского оборудования', name_kz: 'Медициналық жабдық қызметі' },
    { key: 'ENGINEERING', name_ru: 'Инженерная служба', name_kz: 'Инженерлік қызмет' },
  ];

  const createdDepartments: Record<string, any> = {};
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
      console.log(`  ⏭️ Department exists: ${dept.name_ru}`);
    }
  }

  // 2. Seed Roles
  console.log('🔑 Creating roles...');
  const rolesToCreate = [
    { name: 'SuperAdmin', description: 'Суперадминистратор - полный доступ ко всему', type: 'superadmin' },
    { name: 'Admin', description: 'Администратор отдела', type: 'admin' },
    { name: 'Lead', description: 'Руководитель отдела', type: 'lead' },
    { name: 'Member', description: 'Сотрудник отдела', type: 'member' },
  ];

  const createdRoles: Record<string, any> = {};
  for (const roleData of rolesToCreate) {
    const existing = await strapi.entityService.findMany('plugin::users-permissions.role', {
      filters: { type: roleData.type },
    });

    if (existing.length === 0) {
      const created = await strapi.entityService.create('plugin::users-permissions.role', {
        data: roleData,
      });
      createdRoles[roleData.type] = created;
      console.log(`  ✅ Created role: ${roleData.name}`);
    } else {
      createdRoles[roleData.type] = existing[0];
      console.log(`  ⏭️ Role exists: ${roleData.name}`);
    }
  }

  // Also get authenticated role (default Strapi role)
  const allRoles = await strapi.entityService.findMany('plugin::users-permissions.role');
  const authenticatedRole = allRoles.find((r: any) => r.type === 'authenticated');
  if (authenticatedRole) {
    createdRoles['authenticated'] = authenticatedRole;
  }

  // 3. Seed Users
  console.log('👥 Creating users...');

  // Use our created roles
  const superAdminRoleId = createdRoles['superadmin']?.id || createdRoles['admin']?.id || authenticatedRole?.id;
  const adminRoleId = createdRoles['admin']?.id || createdRoles['superadmin']?.id || authenticatedRole?.id;
  const leadRoleId = createdRoles['lead']?.id || authenticatedRole?.id;
  const memberRoleId = createdRoles['member']?.id || authenticatedRole?.id;

  const usersToSeed = [
    // SuperAdmin (без отдела - видит всё)
    {
      key: 'SUPERADMIN',
      username: 'superadmin',
      email: 'superadmin@example.com',
      firstName: 'Супер',
      lastName: 'Админ',
      departmentKey: null, // Без отдела - видит всё
      roleId: superAdminRoleId,
    },
    // IT Admin (с отделом IT)
    {
      key: 'ADMIN',
      username: 'admin',
      email: 'admin@example.com',
      firstName: 'Админ',
      lastName: 'Системный',
      departmentKey: 'IT',
      roleId: adminRoleId,
    },
    // IT Lead
    {
      key: 'IT_LEAD',
      username: 'it.lead',
      email: 'it.lead@example.com',
      firstName: 'Асхат',
      lastName: 'Нурланов',
      departmentKey: 'IT',
      roleId: leadRoleId,
    },
    // IT Helpdesk Staff (реальные сотрудники)
    {
      key: 'SAID',
      username: 'said',
      email: 'said@nnmc.kz',
      firstName: 'Саид',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'ZHANDOS',
      username: 'zhandos',
      email: 'zhandos@nnmc.kz',
      firstName: 'Жандос',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'ERNAR',
      username: 'ernar',
      email: 'ernar@nnmc.kz',
      firstName: 'Ернар',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'BAKHODYR',
      username: 'bakhodyr',
      email: 'bakhodyr@nnmc.kz',
      firstName: 'Баходыр',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'KUAT',
      username: 'kuat',
      email: 'kuat@nnmc.kz',
      firstName: 'Куат',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'RUSTAM',
      username: 'rustam',
      email: 'rustam@nnmc.kz',
      firstName: 'Рустам',
      lastName: '',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    {
      key: 'IT_MEMBER',
      username: 'it.member',
      email: 'it.member@example.com',
      firstName: 'Дамир',
      lastName: 'Сериков',
      departmentKey: 'IT',
      roleId: memberRoleId,
    },
    // Digitalization
    {
      key: 'DIGITAL_LEAD',
      username: 'digital.lead',
      email: 'digital.lead@example.com',
      firstName: 'Айгуль',
      lastName: 'Касымова',
      departmentKey: 'DIGITALIZATION',
      roleId: leadRoleId,
    },
    {
      key: 'DIGITAL_MEMBER',
      username: 'digital.member',
      email: 'digital.member@example.com',
      firstName: 'Ерлан',
      lastName: 'Жумабаев',
      departmentKey: 'DIGITALIZATION',
      roleId: memberRoleId,
    },
    // Medical Equipment
    {
      key: 'MED_LEAD',
      username: 'med.lead',
      email: 'med.lead@example.com',
      firstName: 'Марат',
      lastName: 'Бекенов',
      departmentKey: 'MEDICAL_EQUIPMENT',
      roleId: leadRoleId,
    },
    {
      key: 'MED_MEMBER',
      username: 'med.member',
      email: 'med.member@example.com',
      firstName: 'Алия',
      lastName: 'Тулеева',
      departmentKey: 'MEDICAL_EQUIPMENT',
      roleId: memberRoleId,
    },
    // Engineering
    {
      key: 'ENG_LEAD',
      username: 'eng.lead',
      email: 'eng.lead@example.com',
      firstName: 'Болат',
      lastName: 'Ахметов',
      departmentKey: 'ENGINEERING',
      roleId: leadRoleId,
    },
    {
      key: 'ENG_MEMBER',
      username: 'eng.member',
      email: 'eng.member@example.com',
      firstName: 'Нурсултан',
      lastName: 'Калиев',
      departmentKey: 'ENGINEERING',
      roleId: memberRoleId,
    },
  ];

  const createdUsers: Record<string, any> = {};

  for (const seedUser of usersToSeed) {
    const existing = await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: {
        $or: [{ email: seedUser.email }, { username: seedUser.username }],
      },
    });

    let user = existing[0];
    if (!user) {
      const userData: any = {
        email: seedUser.email,
        username: seedUser.username,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        password: 'Password123!',
        role: seedUser.roleId,
        confirmed: true,
        blocked: false,
        provider: 'local',
      };
      // Только добавляем отдел если он указан
      if (seedUser.departmentKey && createdDepartments[seedUser.departmentKey]) {
        userData.department = createdDepartments[seedUser.departmentKey].id;
      }
      user = await strapi.entityService.create('plugin::users-permissions.user', {
        data: userData,
      });
      console.log(`  ✅ Created user: ${seedUser.email} (${seedUser.firstName} ${seedUser.lastName})`);
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
      order: 1,
      color: '#64748B',
    },
    {
      name_ru: 'Подготовка к проекту (ТЗ, аналитика)',
      name_kz: 'Жобаға дайындық (ТТ, талдау)',
      order: 2,
      color: '#0EA5E9',
    },
    {
      name_ru: 'В работе',
      name_kz: 'Жұмыста',
      order: 3,
      color: '#F97316',
    },
    {
      name_ru: 'Тестирование',
      name_kz: 'Тестілеу',
      order: 4,
      color: '#EAB308',
    },
    {
      name_ru: 'В промышленной эксплуатации',
      name_kz: 'Өнеркәсіптік пайдалануда',
      order: 5,
      color: '#22C55E',
    },
  ];

  const createdStages: any[] = [];
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

  // 4. Seed Service Groups (Helpdesk)
  console.log('🎧 Creating service groups...');
  const serviceGroups = [
    {
      name_ru: 'IT-поддержка',
      name_kz: 'IT-қолдау',
      slug: 'it-support',
      departmentKey: 'IT',
    },
    {
      name_ru: 'Медицинское оборудование',
      name_kz: 'Медициналық жабдық',
      slug: 'medical-equipment',
      departmentKey: 'MEDICAL_EQUIPMENT',
    },
    {
      name_ru: 'Инженерная служба',
      name_kz: 'Инженерлік қызмет',
      slug: 'engineering',
      departmentKey: 'ENGINEERING',
    },
  ];

  const createdServiceGroups: Record<string, any> = {};
  for (const sg of serviceGroups) {
    const existing = await strapi.entityService.findMany('api::service-group.service-group', {
      filters: { slug: sg.slug },
    });

    const serviceGroupData = {
      name_ru: sg.name_ru,
      name_kz: sg.name_kz,
      slug: sg.slug,
      department: createdDepartments[sg.departmentKey]?.id,
    };

    if (existing.length === 0) {
      const created = await strapi.entityService.create('api::service-group.service-group', {
        data: serviceGroupData,
      });
      createdServiceGroups[sg.slug] = created;
      console.log(`  ✅ Created service group: ${sg.name_ru} (dept: ${sg.departmentKey})`);
    } else {
      // Update existing to ensure department is set correctly
      const updated = await strapi.entityService.update('api::service-group.service-group', existing[0].id, {
        data: serviceGroupData,
      });
      createdServiceGroups[sg.slug] = updated;
      console.log(`  🔄 Updated service group: ${sg.name_ru} (dept: ${sg.departmentKey})`);
    }
  }

  // 5. Seed Ticket Categories with default assignees
  console.log('📋 Creating ticket categories...');
  const ticketCategories = [
    // IT categories - с ответственными по умолчанию
    { name_ru: 'Поломка компьютера', name_kz: 'Компьютер бұзылуы', slug: 'computer-breakdown', serviceGroupSlug: 'it-support', order: 1, defaultAssigneeKeys: ['ZHANDOS', 'ERNAR'] },
    { name_ru: '1С - техподдержка', name_kz: '1С - техникалық қолдау', slug: '1c-support', serviceGroupSlug: 'it-support', order: 2, defaultAssigneeKey: 'SAID' },
    { name_ru: 'Принтер / МФУ', name_kz: 'Принтер / МФУ', slug: 'printer', serviceGroupSlug: 'it-support', order: 3, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'Интернет / Локальная сеть', name_kz: 'Интернет / Жергілікті желі', slug: 'network', serviceGroupSlug: 'it-support', order: 4, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'СКУД - выдача карт / потеря', name_kz: 'СКУД - карта беру / жоғалту', slug: 'access-control', serviceGroupSlug: 'it-support', order: 5, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'СКУД - поломка', name_kz: 'СКУД - бұзылу', slug: 'access-control-repair', serviceGroupSlug: 'it-support', order: 6, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Телефония', name_kz: 'Телефония', slug: 'telephony', serviceGroupSlug: 'it-support', order: 7, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'Видеонаблюдение', name_kz: 'Бейнебақылау', slug: 'cctv', serviceGroupSlug: 'it-support', order: 8, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Электронная почта / Outlook', name_kz: 'Электрондық пошта / Outlook', slug: 'email', serviceGroupSlug: 'it-support', order: 9, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'Damumed - техподдержка', name_kz: 'Damumed - техникалық қолдау', slug: 'damumed', serviceGroupSlug: 'it-support', order: 10, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'ЛИС - техподдержка', name_kz: 'ЛИС - техникалық қолдау', slug: 'lis', serviceGroupSlug: 'it-support', order: 11, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'МЗРК - порталы', name_kz: 'МЗРК - порталдар', slug: 'mzrk', serviceGroupSlug: 'it-support', order: 12, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'SimBase - техподдержка', name_kz: 'SimBase - техникалық қолдау', slug: 'simbase', serviceGroupSlug: 'it-support', order: 13, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'SimBase - создание аккаунта', name_kz: 'SimBase - аккаунт құру', slug: 'simbase-account', serviceGroupSlug: 'it-support', order: 14, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'SimBase - сброс пароля', name_kz: 'SimBase - құпия сөзді қалпына келтіру', slug: 'simbase-password', serviceGroupSlug: 'it-support', order: 15, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Документолог - техподдержка', name_kz: 'Документолог - техникалық қолдау', slug: 'documentolog', serviceGroupSlug: 'it-support', order: 16, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Доменная учетная запись', name_kz: 'Домендік есептік жазба', slug: 'domain-account', serviceGroupSlug: 'it-support', order: 17, defaultAssigneeKey: 'RUSTAM' },
    { name_ru: 'Zoom / Word / Excel', name_kz: 'Zoom / Word / Excel', slug: 'office-software', serviceGroupSlug: 'it-support', order: 18, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'Заправка картриджа', name_kz: 'Картридж толтыру', slug: 'cartridge', serviceGroupSlug: 'it-support', order: 19, defaultAssigneeKey: 'ERNAR' },
    { name_ru: 'Другое IT', name_kz: 'Басқа IT', slug: 'it-other', serviceGroupSlug: 'it-support', order: 20, defaultAssigneeKey: 'ZHANDOS' },
    // Medical Equipment categories
    { name_ru: 'Диагностическое оборудование', name_kz: 'Диагностикалық жабдық', slug: 'diagnostic-equipment', serviceGroupSlug: 'medical-equipment', order: 1 },
    { name_ru: 'Лабораторное оборудование', name_kz: 'Зертханалық жабдық', slug: 'lab-equipment', serviceGroupSlug: 'medical-equipment', order: 2 },
    { name_ru: 'Хирургическое оборудование', name_kz: 'Хирургиялық жабдық', slug: 'surgical-equipment', serviceGroupSlug: 'medical-equipment', order: 3 },
    { name_ru: 'Другое', name_kz: 'Басқа', slug: 'med-other', serviceGroupSlug: 'medical-equipment', order: 4 },
    // Engineering categories
    { name_ru: 'Электроснабжение', name_kz: 'Электрмен жабдықтау', slug: 'electrical', serviceGroupSlug: 'engineering', order: 1 },
    { name_ru: 'Водоснабжение / Канализация', name_kz: 'Сумен жабдықтау / Кәріз', slug: 'plumbing', serviceGroupSlug: 'engineering', order: 2 },
    { name_ru: 'Отопление / Вентиляция', name_kz: 'Жылыту / Желдету', slug: 'hvac', serviceGroupSlug: 'engineering', order: 3 },
    { name_ru: 'Лифты', name_kz: 'Лифттер', slug: 'elevators', serviceGroupSlug: 'engineering', order: 4 },
    { name_ru: 'Другое', name_kz: 'Басқа', slug: 'eng-other', serviceGroupSlug: 'engineering', order: 5 },
  ];

  const createdCategories: Record<string, any> = {};
  for (const cat of ticketCategories) {
    const existing = await strapi.entityService.findMany('api::ticket-category.ticket-category', {
      filters: { slug: cat.slug },
    });

    const categoryData: any = {
      name_ru: cat.name_ru,
      name_kz: cat.name_kz,
      slug: cat.slug,
      order: cat.order,
      serviceGroup: createdServiceGroups[cat.serviceGroupSlug]?.id,
    };

    const defaultAssigneeKeys = ((cat as any).defaultAssigneeKeys as string[] | undefined) || [];
    const legacyDefaultAssigneeKey = (cat as any).defaultAssigneeKey as string | undefined;

    // Multi-assignee field (single schema key defaultAssignee)
    if (defaultAssigneeKeys.length > 0) {
      categoryData.defaultAssignee = {
        set: defaultAssigneeKeys
          .map((key) => createdUsers[key]?.id)
          .filter((id): id is number => Boolean(id))
          .map((id) => ({ id })),
      };
    } else if (legacyDefaultAssigneeKey && createdUsers[legacyDefaultAssigneeKey]) {
      // Backward compatible input form
      categoryData.defaultAssignee = {
        set: [{ id: createdUsers[legacyDefaultAssigneeKey].id }],
      };
    }

    if (existing.length === 0) {
      const created = await strapi.entityService.create('api::ticket-category.ticket-category', {
        data: categoryData,
      });
      createdCategories[cat.slug] = created;
      const assigneeLog = defaultAssigneeKeys.length > 0
        ? defaultAssigneeKeys.join(', ')
        : (cat as any).defaultAssigneeKey || '';
      console.log(`  ✅ Created category: ${cat.name_ru}${assigneeLog ? ` (→ ${assigneeLog})` : ''}`);
    } else {
      // Обновляем существующую категорию с defaultAssignee
      const updated = await strapi.entityService.update('api::ticket-category.ticket-category', existing[0].id, {
        data: categoryData,
      });
      createdCategories[cat.slug] = updated;
      const assigneeLog = defaultAssigneeKeys.length > 0
        ? defaultAssigneeKeys.join(', ')
        : (cat as any).defaultAssigneeKey || '';
      console.log(`  🔄 Updated category: ${cat.name_ru}${assigneeLog ? ` (→ ${assigneeLog})` : ''}`);
    }
  }

  // 6. Seed sample tickets
  console.log('🎫 Creating sample tickets...');
  const sampleTickets = [
    {
      requesterName: 'Сергей Петров',
      requesterPhone: '+7 701 111 2233',
      requesterDepartment: 'Терапия',
      comment: 'Не включается компьютер на рабочем месте, после нажатия кнопки питания ничего не происходит.',
      status: 'NEW',
      serviceGroupSlug: 'it-support',
      categorySlug: 'computer-breakdown',
    },
    {
      requesterName: 'Анна Козлова',
      requesterPhone: '+7 702 333 4455',
      requesterDepartment: 'Бухгалтерия',
      comment: 'Ошибка при формировании отчета в 1С Бухгалтерия, выдает код ошибки 0x80004005.',
      status: 'IN_PROGRESS',
      serviceGroupSlug: 'it-support',
      categorySlug: '1c-support',
      assigneeKey: 'IT_MEMBER',
    },
    {
      requesterName: 'Медсестра Айжан',
      requesterPhone: '+7 705 555 6677',
      requesterDepartment: 'Реанимация',
      comment: 'Аппарат ИВЛ показывает ошибку E-05, требуется диагностика.',
      status: 'NEW',
      serviceGroupSlug: 'medical-equipment',
      categorySlug: 'diagnostic-equipment',
    },
    {
      requesterName: 'Охранник Кайрат',
      requesterPhone: '+7 707 888 9900',
      requesterDepartment: 'Охрана',
      comment: 'Не работает турникет на центральном входе, карточки не считываются.',
      status: 'DONE',
      serviceGroupSlug: 'it-support',
      categorySlug: 'access-control',
      assigneeKey: 'IT_LEAD',
      staffComment: 'Заменен считыватель карт, турникет работает.',
      complexity: 'B',
    },
    {
      requesterName: 'Нурлан Ермеков',
      requesterPhone: '+7 700 123 4567',
      requesterDepartment: 'Хозяйственный отдел',
      comment: 'Протечка трубы горячего водоснабжения в подвале корпуса Б.',
      status: 'IN_PROGRESS',
      serviceGroupSlug: 'engineering',
      categorySlug: 'plumbing',
      assigneeKey: 'ENG_LEAD',
    },
  ];

  for (const ticket of sampleTickets) {
    const existing = await strapi.entityService.findMany('api::ticket.ticket', {
      filters: { comment: ticket.comment },
    });

    if (existing.length === 0) {
      const serviceGroup = createdServiceGroups[ticket.serviceGroupSlug];
      const catResults = await strapi.entityService.findMany('api::ticket-category.ticket-category', {
        filters: { slug: ticket.categorySlug },
      });
      const category = catResults[0];

      const ticketData: any = {
        requesterName: ticket.requesterName,
        requesterPhone: ticket.requesterPhone,
        requesterDepartment: ticket.requesterDepartment,
        comment: ticket.comment,
        status: ticket.status,
        serviceGroup: serviceGroup?.id,
        category: category?.id,
        ticketNumber: 'TEMP',
      };

      if (ticket.assigneeKey && createdUsers[ticket.assigneeKey]) {
        ticketData.assignee = createdUsers[ticket.assigneeKey].id;
      }
      if ((ticket as any).staffComment) {
        ticketData.staffComment = (ticket as any).staffComment;
      }
      if ((ticket as any).complexity) {
        ticketData.complexity = (ticket as any).complexity;
      }

      await strapi.entityService.create('api::ticket.ticket', {
        data: ticketData,
      });
      console.log(`  ✅ Created ticket: ${ticket.requesterName} - ${ticket.comment.substring(0, 40)}...`);
    } else {
      console.log(`  ⏭️ Ticket exists: ${ticket.requesterName}`);
    }
  }

  // 7. Seed sample projects
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
      console.log(`  ⏭️ Project exists: ${projectFields.title}`);
    }
  }

  console.log('✨ Seed completed!');
};

export default seedData;
