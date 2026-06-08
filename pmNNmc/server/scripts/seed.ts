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
    { key: 'ENGINEERING', name_ru: 'Хозяйственная служба', name_kz: 'Шаруашылық қызметі' },
    { key: 'RADIOLOGY', name_ru: 'Лучевая', name_kz: 'Сәулелік' },
    { key: 'ECONOMICS', name_ru: 'Экономика', name_kz: 'Экономика' },
    { key: 'CLEANING', name_ru: 'Клининг', name_kz: 'Клининг' },
    { key: 'CLINICAL_PHARMACOLOGY', name_ru: 'Клинико-фармакологический отдел', name_kz: 'Клиникалық-фармакологиялық бөлім' },
    { key: 'CLINIC_ADMINISTRATION', name_ru: 'Администрация (клиника)', name_kz: 'Әкімшілік (клиника)' },
    { key: 'PATIENT_SUPPORT', name_ru: 'Служба поддержки пациента и внутренней экспертизы', name_kz: 'Пациентті қолдау және ішкі сараптама қызметі' },
    { key: 'HR', name_ru: 'Отдел управления персоналом', name_kz: 'Персоналды басқару бөлімі' },
    { key: 'ACCOUNTING', name_ru: 'Отдел бухгалтерского учета и отчетности', name_kz: 'Бухгалтерлік есеп және есептілік бөлімі' },
    { key: 'RECEPTION', name_ru: 'Приемный отдел', name_kz: 'Қабылдау бөлімі' },
    { key: 'MARKETING', name_ru: 'Отдел маркетинга', name_kz: 'Маркетинг бөлімі' },
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
      name_ru: 'Хозяйственная служба',
      name_kz: 'Шаруашылық қызметі',
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
    { name_ru: 'Поломка компьютера', name_kz: 'Компьютер бұзылуы', slug: 'computer-breakdown', serviceGroupSlug: 'it-support', order: 1, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    { name_ru: '1С - техподдержка', name_kz: '1С - техникалық қолдау', slug: '1c-support', serviceGroupSlug: 'it-support', order: 2, defaultAssigneeKey: 'SAID' },
    { name_ru: 'Принтер / МФУ', name_kz: 'Принтер / МФУ', slug: 'printer', serviceGroupSlug: 'it-support', order: 3, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    { name_ru: 'Интернет / Локальная сеть', name_kz: 'Интернет / Жергілікті желі', slug: 'network', serviceGroupSlug: 'it-support', order: 4, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    { name_ru: 'СКУД - выдача карт / потеря', name_kz: 'СКУД - карта беру / жоғалту', slug: 'access-control', serviceGroupSlug: 'it-support', order: 5, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'СКУД - поломка', name_kz: 'СКУД - бұзылу', slug: 'access-control-repair', serviceGroupSlug: 'it-support', order: 6, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Электронная почта / Outlook', name_kz: 'Электрондық пошта / Outlook', slug: 'email', serviceGroupSlug: 'it-support', order: 7, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    { name_ru: 'Damumed - техподдержка', name_kz: 'Damumed - техникалық қолдау', slug: 'damumed', serviceGroupSlug: 'it-support', order: 10, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'ЛИС - техподдержка', name_kz: 'ЛИС - техникалық қолдау', slug: 'lis', serviceGroupSlug: 'it-support', order: 11, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'МЗРК - порталы', name_kz: 'МЗРК - порталдар', slug: 'mzrk', serviceGroupSlug: 'it-support', order: 12, defaultAssigneeKey: 'BAKHODYR' },
    { name_ru: 'SimBase - техподдержка', name_kz: 'SimBase - техникалық қолдау', slug: 'simbase', serviceGroupSlug: 'it-support', order: 13, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'SimBase - создание аккаунта', name_kz: 'SimBase - аккаунт құру', slug: 'simbase-account', serviceGroupSlug: 'it-support', order: 14, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'SimBase - сброс пароля', name_kz: 'SimBase - құпия сөзді қалпына келтіру', slug: 'simbase-password', serviceGroupSlug: 'it-support', order: 15, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Документолог - техподдержка', name_kz: 'Документолог - техникалық қолдау', slug: 'documentolog', serviceGroupSlug: 'it-support', order: 16, defaultAssigneeKey: 'KUAT' },
    { name_ru: 'Доменная учетная запись', name_kz: 'Домендік есептік жазба', slug: 'domain-account', serviceGroupSlug: 'it-support', order: 17, defaultAssigneeKey: 'RUSTAM' },
    { name_ru: 'Zoom / Word / Excel', name_kz: 'Zoom / Word / Excel', slug: 'office-software', serviceGroupSlug: 'it-support', order: 18, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    { name_ru: 'Заправка картриджа', name_kz: 'Картридж толтыру', slug: 'cartridge', serviceGroupSlug: 'it-support', order: 19, defaultAssigneeKeys: ['ERNAR', 'ZHANDOS'] },
    // Medical Equipment categories - mirrors the legacy 8081 HelpDesk form
    { name_ru: 'Не включается, индикация не горит, не загорается монитор.', name_kz: 'Не включается, индикация не горит, не загорается монитор.', slug: 'med-indicator', serviceGroupSlug: 'medical-equipment', order: 1 },
    { name_ru: 'Не реагируют кнопки, не загружается программа.', name_kz: 'Не реагируют кнопки, не загружается программа.', slug: 'med-non-load', serviceGroupSlug: 'medical-equipment', order: 2 },
    { name_ru: 'Не дает набрать объем, не регулируются настройки.', name_kz: 'Не дает набрать объем, не регулируются настройки.', slug: 'med-non-regul', serviceGroupSlug: 'medical-equipment', order: 3 },
    { name_ru: 'Проблема с столом (не подымается не опускается)', name_kz: 'Проблема с столом (не подымается не опускается)', slug: 'med-table', serviceGroupSlug: 'medical-equipment', order: 4 },
    { name_ru: 'Не работает, гудит, стучит, не греет.', name_kz: 'Не работает, гудит, стучит, не греет.', slug: 'med-not-heating', serviceGroupSlug: 'medical-equipment', order: 5 },
    { name_ru: 'Не светит диод, выдает ошибку.', name_kz: 'Не светит диод, выдает ошибку.', slug: 'med-diode-error', serviceGroupSlug: 'medical-equipment', order: 6 },
    { name_ru: 'Не работают тормоза.', name_kz: 'Не работают тормоза.', slug: 'med-brakes', serviceGroupSlug: 'medical-equipment', order: 7 },
    { name_ru: 'Зависает во время работы.', name_kz: 'Зависает во время работы.', slug: 'med-freezes', serviceGroupSlug: 'medical-equipment', order: 8 },
    { name_ru: 'Не выводит изображение на экран.', name_kz: 'Не выводит изображение на экран.', slug: 'med-no-screen-output', serviceGroupSlug: 'medical-equipment', order: 9 },
    { name_ru: 'Не измеряет, не верные показания.', name_kz: 'Не измеряет, не верные показания.', slug: 'med-measurement-error', serviceGroupSlug: 'medical-equipment', order: 10 },
    { name_ru: 'Не качает, утечка воды, утечка воздуха, утечка пара.', name_kz: 'Не качает, утечка воды, утечка воздуха, утечка пара.', slug: 'med-leak', serviceGroupSlug: 'medical-equipment', order: 11 },
    { name_ru: 'Нет уровня жидкости, не держит давления', name_kz: 'Нет уровня жидкости, не держит давления', slug: 'med-pressure', serviceGroupSlug: 'medical-equipment', order: 12 },
    { name_ru: 'Не работает блок питания.', name_kz: 'Не работает блок питания.', slug: 'med-power-supply', serviceGroupSlug: 'medical-equipment', order: 13 },
    { name_ru: 'Постоянно перезагружается.', name_kz: 'Постоянно перезагружается.', slug: 'med-reboots', serviceGroupSlug: 'medical-equipment', order: 14 },
    { name_ru: 'Не дает заряд, не держит заряд.', name_kz: 'Не дает заряд, не держит заряд.', slug: 'med-battery', serviceGroupSlug: 'medical-equipment', order: 15 },
    { name_ru: 'Слышен посторонний шум.', name_kz: 'Слышен посторонний шум.', slug: 'med-noise', serviceGroupSlug: 'medical-equipment', order: 16 },
    { name_ru: 'Запах гари, запах дыма', name_kz: 'Запах гари, запах дыма', slug: 'med-smell-smoke', serviceGroupSlug: 'medical-equipment', order: 17 },
    { name_ru: 'Не снимает нет передачи данных.', name_kz: 'Не снимает нет передачи данных.', slug: 'med-data-transfer', serviceGroupSlug: 'medical-equipment', order: 18 },
    { name_ru: 'КЗД (внеплановые смывы)', name_kz: 'КЗД (внеплановые смывы)', slug: 'med-kzd', serviceGroupSlug: 'medical-equipment', order: 19 },
    // Engineering/household categories - mirrors the legacy 8082 HelpDesk form
    { name_ru: 'Демонтаж и замена унитаза (установка)', name_kz: 'Демонтаж и замена унитаза (установка)', slug: 'eng-plumbing-toilet-replacement', serviceGroupSlug: 'engineering', order: 1 },
    { name_ru: 'Демонтаж и замена раковины (установка)', name_kz: 'Демонтаж и замена раковины (установка)', slug: 'eng-plumbing-sink-replacement', serviceGroupSlug: 'engineering', order: 2 },
    { name_ru: 'Демонтаж и замена смесителя', name_kz: 'Демонтаж и замена смесителя', slug: 'eng-plumbing-mixer-replacement', serviceGroupSlug: 'engineering', order: 3 },
    { name_ru: 'Демонтаж и замена гофры для смесителя', name_kz: 'Демонтаж и замена гофры для смесителя', slug: 'eng-plumbing-mixer-corrugation', serviceGroupSlug: 'engineering', order: 4 },
    { name_ru: 'Чистка аэраторов', name_kz: 'Чистка аэраторов', slug: 'eng-plumbing-aerator-cleaning', serviceGroupSlug: 'engineering', order: 5 },
    { name_ru: 'Чистка гребенки ХВС и ГВС', name_kz: 'Чистка гребенки ХВС и ГВС', slug: 'eng-plumbing-water-comb-cleaning', serviceGroupSlug: 'engineering', order: 6 },
    { name_ru: 'Чистка и заделка швов сантехническим силиконом', name_kz: 'Чистка и заделка швов сантехническим силиконом', slug: 'eng-plumbing-silicone-seams', serviceGroupSlug: 'engineering', order: 7 },
    { name_ru: 'Демонтаж и монтаж кранов', name_kz: 'Демонтаж и монтаж кранов', slug: 'eng-plumbing-tap-installation', serviceGroupSlug: 'engineering', order: 8 },
    { name_ru: 'Демонтаж и монтаж радиаторов отопления', name_kz: 'Демонтаж и монтаж радиаторов отопления', slug: 'eng-plumbing-radiator-installation', serviceGroupSlug: 'engineering', order: 9 },
    { name_ru: 'Прочистка канализационный труб', name_kz: 'Прочистка канализационный труб', slug: 'eng-plumbing-sewer-pipe-cleaning', serviceGroupSlug: 'engineering', order: 10 },
    { name_ru: 'Демонтаж и замена шланги для смесителя', name_kz: 'Демонтаж и замена шланги для смесителя', slug: 'eng-plumbing-mixer-hose-replacement', serviceGroupSlug: 'engineering', order: 11 },
    { name_ru: 'Демонтаж и замена шланги для унитаза', name_kz: 'Демонтаж и замена шланги для унитаза', slug: 'eng-plumbing-toilet-hose-replacement', serviceGroupSlug: 'engineering', order: 12 },
    { name_ru: 'Демонтаж-и-монтаж-арматуры', name_kz: 'Демонтаж-и-монтаж-арматуры', slug: 'eng-plumbing-toilet-fittings', serviceGroupSlug: 'engineering', order: 13 },
    { name_ru: 'Прочистка слива раковины, душевых кабин.', name_kz: 'Прочистка слива раковины, душевых кабин.', slug: 'eng-plumbing-drain-cleaning', serviceGroupSlug: 'engineering', order: 14 },
    { name_ru: 'Ежедневная обслуга парагенератора', name_kz: 'Ежедневная обслуга парагенератора', slug: 'eng-plumbing-steam-generator-service', serviceGroupSlug: 'engineering', order: 15 },
    { name_ru: 'Обслуживание тепловых станций', name_kz: 'Обслуживание тепловых станций', slug: 'eng-plumbing-heating-stations', serviceGroupSlug: 'engineering', order: 16 },
    { name_ru: 'Обслуживание сетей ХВС и ГВС, теплоснабжение', name_kz: 'Обслуживание сетей ХВС и ГВС, теплоснабжение', slug: 'eng-plumbing-water-heating-networks', serviceGroupSlug: 'engineering', order: 17 },
    { name_ru: 'Демонтаж и замена выкючателя', name_kz: 'Демонтаж и замена выкючателя', slug: 'eng-electrical-switch-replacement', serviceGroupSlug: 'engineering', order: 101 },
    { name_ru: 'Демонтаж и замена розетки', name_kz: 'Демонтаж и замена розетки', slug: 'eng-electrical-socket-replacement', serviceGroupSlug: 'engineering', order: 102 },
    { name_ru: 'Демонтаж и замена светильника', name_kz: 'Демонтаж и замена светильника', slug: 'eng-electrical-light-replacement', serviceGroupSlug: 'engineering', order: 103 },
    { name_ru: 'Демонтаж и замена автомата', name_kz: 'Демонтаж и замена автомата', slug: 'eng-electrical-breaker-replacement', serviceGroupSlug: 'engineering', order: 104 },
    { name_ru: 'Своевременное устранение неисправности электооборудования и технического оснащения здания', name_kz: 'Своевременное устранение неисправности электооборудования и технического оснащения здания', slug: 'eng-electrical-equipment-troubleshooting', serviceGroupSlug: 'engineering', order: 105 },
    { name_ru: 'Ремонт электрооборудования', name_kz: 'Ремонт электрооборудования', slug: 'eng-electrical-equipment-repair', serviceGroupSlug: 'engineering', order: 107 },
    { name_ru: 'Демонтаж и монтаж электрооборудования', name_kz: 'Демонтаж и монтаж электрооборудования', slug: 'eng-electrical-equipment-installation', serviceGroupSlug: 'engineering', order: 108 },
    { name_ru: 'Диагностика неисправности электрооборудования', name_kz: 'Диагностика неисправности электрооборудования', slug: 'eng-electrical-diagnostics', serviceGroupSlug: 'engineering', order: 109 },
    { name_ru: 'Контроль температуры в помещении ИБП', name_kz: 'Контроль температуры в помещении ИБП', slug: 'eng-electrical-ups-temperature-control', serviceGroupSlug: 'engineering', order: 110 },
    { name_ru: 'Ежедневный обход по объекту:ДГУ.РУ.', name_kz: 'Ежедневный обход по объекту:ДГУ.РУ.', slug: 'eng-electrical-dgu-ru-round', serviceGroupSlug: 'engineering', order: 111 },
    { name_ru: 'Ежедневный обход щитовых:МДВ 1,2,3,4,', name_kz: 'Ежедневный обход щитовых:МДВ 1,2,3,4,', slug: 'eng-electrical-panel-room-round', serviceGroupSlug: 'engineering', order: 112 },
    { name_ru: 'Обход плантронов 1-5, 3,4,6', name_kz: 'Обход плантронов 1-5, 3,4,6', slug: 'eng-ventilation-plantron-round', serviceGroupSlug: 'engineering', order: 201 },
    { name_ru: 'Обход прачечной', name_kz: 'Обход прачечной', slug: 'eng-ventilation-laundry-round', serviceGroupSlug: 'engineering', order: 202 },
    { name_ru: 'Обход Микробиологии и Патоморфологии', name_kz: 'Обход Микробиологии и Патоморфологии', slug: 'eng-ventilation-microbiology-pathomorphology-round', serviceGroupSlug: 'engineering', order: 203 },
    { name_ru: 'Замена синтипона на приточных машинах', name_kz: 'Замена синтипона на приточных машинах', slug: 'eng-ventilation-sintepon-replacement', serviceGroupSlug: 'engineering', order: 204 },
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
