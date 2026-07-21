import crypto from 'crypto';
import type { Context } from 'koa';

const INVITATION_UID = 'api::onboarding-invitation.onboarding-invitation' as any;
const SETTINGS_UID = 'api::onboarding-setting.onboarding-setting' as any;
const EMPLOYEE_CARD_UID = 'api::employee-card.employee-card' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const INVITATION_DAYS = 3;
const MAX_ATTEMPTS = 3;

const DOCUMENT_REQUIREMENT_KEYS = [
  'identityPhoto',
  'identityDocument',
  'signature',
  'form075',
  'noCriminalRecord',
  'narcology',
  'psychiatry',
  'marriageDocument',
  'familyMemberDocuments',
  'educationDocuments',
  'bankRequisites',
] as const;
const EXTRA_FIELD_SECTIONS = ['identity', 'documents', 'contacts', 'education', 'medical', 'family', 'work', 'bank'] as const;
const EXTRA_FIELD_TYPES = ['text', 'textarea', 'date', 'select', 'checkbox', 'file'] as const;

type OnboardingSettings = {
  documentRequirements: Record<string, boolean>;
  extraFields: Array<{
    id: string;
    section: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
};

function defaultOnboardingSettings(): OnboardingSettings {
  return {
    documentRequirements: Object.fromEntries(DOCUMENT_REQUIREMENT_KEYS.map((key) => [key, false])),
    extraFields: [],
  };
}

function normalizeOnboardingSettings(value: any): OnboardingSettings {
  const defaults = defaultOnboardingSettings();
  const requirements = value?.documentRequirements || {};
  const extraFields = (Array.isArray(value?.extraFields) ? value.extraFields : [])
    .slice(0, 50)
    .map((field: any, index: number) => {
      const id = cleanString(field?.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `extra-${index + 1}`;
      const section = EXTRA_FIELD_SECTIONS.includes(field?.section) ? field.section : 'documents';
      const type = EXTRA_FIELD_TYPES.includes(field?.type) ? field.type : 'text';
      const options = Array.isArray(field?.options)
        ? field.options.map(cleanString).filter(Boolean).slice(0, 100)
        : [];
      return {
        id,
        section,
        label: cleanString(field?.label).slice(0, 160),
        type,
        required: field?.required === true,
        placeholder: cleanString(field?.placeholder).slice(0, 200),
        options,
      };
    })
    .filter((field: any, index: number, fields: any[]) => field.label && fields.findIndex((item) => item.id === field.id) === index);

  return {
    documentRequirements: Object.fromEntries(
      DOCUMENT_REQUIREMENT_KEYS.map((key) => [key, requirements[key] === true || defaults.documentRequirements[key]])
    ),
    extraFields,
  };
}

async function getOnboardingSettings(strapi: any): Promise<OnboardingSettings> {
  const item = await strapi.db.query(SETTINGS_UID).findOne({});
  return normalizeOnboardingSettings(item?.config);
}

function cleanString(value: any): string {
  return String(value ?? '').trim();
}

function normalizeIin(value: any): string {
  return cleanString(value).replace(/\D/g, '').slice(0, 12);
}

function normalizePhone(value: any): string {
  const digits = cleanString(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  return digits;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function isExpired(item: any): boolean {
  const expires = new Date(item?.expiresAt || 0);
  return Number.isFinite(expires.getTime()) && expires.getTime() < Date.now();
}

function makeToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function publicBaseUrl(): string {
  return cleanString(process.env.FRONTEND_URL) || 'http://192.168.101.25:13010';
}

function publicUrl(token: string): string {
  return `${publicBaseUrl().replace(/\/+$/, '')}/onboarding/${token}`;
}

function whatsappUrl(phone: string, token: string): string {
  const message = encodeURIComponent(`Здравствуйте! Для оформления в АО "ННМЦ" заполните анкету нового сотрудника: ${publicUrl(token)}`);
  return `https://wa.me/${normalizePhone(phone)}?text=${message}`;
}

function safeInvitation(item: any) {
  return {
    id: item.id,
    documentId: item.documentId,
    token: item.token,
    iin: item.iin,
    phone: item.phone,
    status: item.status,
    expiresAt: item.expiresAt,
    attemptsLeft: item.attemptsLeft,
    returnedSections: item.returnedSections || [],
    hrComment: item.hrComment || '',
    draft: item.draft || {},
    submittedAt: item.submittedAt,
    approvedAt: item.approvedAt,
    sentToOnecAt: item.sentToOnecAt,
    oneCStatus: item.oneCStatus,
    oneCResponse: item.oneCResponse,
    history: item.history || [],
    publicUrl: publicUrl(item.token),
    whatsappUrl: whatsappUrl(item.phone, item.token),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeUploadFiles(files: any): any[] {
  const raw = files?.files || files?.file || files;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function absoluteFileUrl(url: any): string {
  const value = cleanString(url);
  if (!value || /^https?:\/\//i.test(value)) return value;
  const serverUrl = cleanString(process.env.SERVER_URL || process.env.PUBLIC_URL).replace(/\/+$/, '');
  return `${serverUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function hasUploadedFiles(value: any): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(
    (file: any) => Number(file?.id) > 0 && Boolean(cleanString(file?.url))
  );
}

function validateSubmissionDraft(draft: any, settings: OnboardingSettings): string[] {
  const errors: string[] = [];
  const identity = draft?.identity || {};
  const documents = draft?.documents || {};
  const contacts = draft?.contacts || {};
  const medical = draft?.medical || {};
  const family = draft?.family || {};
  const work = draft?.work || {};
  const namePattern = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі' -]+$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const today = new Date().toISOString().slice(0, 10);

  if (draft?.legal?.accepted !== true) errors.push('Не подтверждено согласие на обработку персональных данных');
  if (settings.documentRequirements.identityPhoto && !hasUploadedFiles(identity.photo)) errors.push('Не загружена фотография 3x4');
  for (const [key, label] of [['lastName', 'фамилия'], ['firstName', 'имя']] as const) {
    const value = cleanString(identity[key]);
    if (!value || !namePattern.test(value)) errors.push(`Некорректно заполнено поле «${label}»`);
  }
  if (!identity.noMiddleName && (!cleanString(identity.middleName) || !namePattern.test(cleanString(identity.middleName)))) {
    errors.push('Некорректно заполнено отчество');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanString(identity.birthDate)) || identity.birthDate < '1900-01-01' || identity.birthDate > today) {
    errors.push('Некорректная дата рождения');
  }
  if (!cleanString(identity.gender) || !cleanString(identity.nationality) || !cleanString(identity.citizenship)) {
    errors.push('Не заполнены пол, национальность или гражданство');
  }
  if (!identity.birthPlaceAddress?.country || !identity.birthPlaceAddress?.region || !identity.birthPlaceAddress?.city) {
    errors.push('Не заполнено место рождения');
  }

  if (!cleanString(documents.documentType) || !cleanString(documents.documentNumber) || !cleanString(documents.issuedBy)) {
    errors.push('Не заполнены реквизиты удостоверяющего документа');
  }
  if (documents.documentType === 'Удостоверение личности' && !/^\d{9}$/.test(cleanString(documents.documentNumber))) {
    errors.push('Номер удостоверения личности должен содержать ровно 9 цифр');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanString(documents.issueDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanString(documents.expiryDate))) {
    errors.push('Некорректно заполнены даты удостоверяющего документа');
  } else if (documents.issueDate > today || documents.expiryDate < documents.issueDate) {
    errors.push('Проверьте дату выдачи и срок действия удостоверяющего документа');
  }
  if (settings.documentRequirements.identityDocument && !hasUploadedFiles(documents.identityFiles)) errors.push('Не загружен PDF удостоверяющего документа');

  for (const address of [contacts.registration, contacts.living]) {
    if (!address?.country || !address?.region || !address?.city || !address?.details) {
      errors.push('Не полностью заполнены адреса регистрации и проживания');
      break;
    }
  }
  if (cleanString(contacts.mobilePhone).replace(/\D/g, '').length !== 11) errors.push('Некорректный мобильный телефон');
  if (contacts.email && !emailPattern.test(cleanString(contacts.email))) errors.push('Некорректный email');
  if (settings.documentRequirements.signature && !hasUploadedFiles(contacts.signatureFile)) errors.push('Не загружен образец личной подписи');

  for (const [key, label] of [
    ['form075', 'форма 075'],
    ['noCriminalRecord', 'справка о несудимости'],
    ['narcology', 'справка из наркологического диспансера'],
    ['psychiatry', 'справка из психиатрического диспансера'],
  ]) {
    if (settings.documentRequirements[key] && !hasUploadedFiles(medical[key])) errors.push(`Не загружен обязательный документ: ${label}`);
  }
  if (!medical.emergencyContactName || !medical.emergencyContactRelation || cleanString(medical.emergencyContactPhone).replace(/\D/g, '').length !== 11) {
    errors.push('Не заполнено контактное лицо для экстренного случая');
  }

  if (!family.maritalStatus) errors.push('Не заполнено семейное положение');
  if (settings.documentRequirements.marriageDocument && family.maritalStatus === 'Состоит в зарегистрированном браке' && !hasUploadedFiles(family.marriageFiles)) {
    errors.push('Не загружено свидетельство о браке');
  }
  for (const member of family.members || []) {
    if (!member?.relation || !member?.fio || !member?.birthDate || (settings.documentRequirements.familyMemberDocuments && !hasUploadedFiles(member?.files))) {
      errors.push('Не полностью заполнены сведения и документы члена семьи');
      break;
    }
  }
  for (const education of draft?.education?.items || []) {
    if (!education?.institution || !education?.degree || (settings.documentRequirements.educationDocuments && !hasUploadedFiles(education?.files))) {
      errors.push('Не полностью заполнены сведения и документы об образовании');
      break;
    }
  }
  if (!cleanString(work.targetPosition)) errors.push('Не выбрана должность, на которую принимается сотрудник');
  if (settings.documentRequirements.bankRequisites && !hasUploadedFiles(draft?.bank?.halykRequisites)) errors.push('Не загружен PDF банковских реквизитов Halyk Bank');
  for (const field of settings.extraFields) {
    if (!field.required) continue;
    const value = draft?.extraFields?.[field.id];
    const missing = field.type === 'file'
      ? !hasUploadedFiles(value)
      : field.type === 'checkbox'
        ? value !== true
        : !cleanString(value);
    if (missing) errors.push(`Не заполнено обязательное поле «${field.label}»`);
  }
  if (draft?.safety?.introReviewed !== true || draft?.safety?.hospitalSafetyReviewed !== true) {
    errors.push('Не подтвержден просмотр двух видео по безопасности');
  }
  return errors;
}

function safePublicInvitation(item: any, includeDraft = false) {
  return {
    token: item.token,
    status: item.status,
    expiresAt: item.expiresAt,
    attemptsLeft: item.attemptsLeft,
    returnedSections: item.returnedSections || [],
    hrComment: item.hrComment || '',
    submittedAt: item.submittedAt,
    approvedAt: item.approvedAt,
    sentToOnecAt: item.sentToOnecAt,
    draft: includeDraft ? item.draft || {} : undefined,
  };
}

function appendHistory(item: any, action: string, label: string, by = 'system') {
  const history = Array.isArray(item?.history) ? item.history : [];
  return [
    ...history,
    {
      at: new Date().toISOString(),
      by,
      action,
      label,
    },
  ];
}

async function loadCurrentUser(ctx: Context, strapi: any) {
  const user = ctx.state.user;
  if (!user?.id) ctx.throw(401, 'Not authenticated');

  return await strapi.entityService.findOne(USER_UID, user.id, {
    fields: ['id', 'username', 'email', 'firstName', 'lastName', 'isSuperAdmin'],
    populate: ['department', 'role'],
  });
}

function userDisplayName(user: any): string {
  return (
    `${user?.lastName || ''} ${user?.firstName || ''}`.trim() ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    'Пользователь'
  );
}

function canManageOnboarding(user: any): boolean {
  const key = cleanString(user?.department?.key).toUpperCase();
  return user?.isSuperAdmin === true || key === 'HR' || user?.department?.canApproveNewEmployees === true;
}

async function findByToken(strapi: any, token: string) {
  return await strapi.db.query(INVITATION_UID).findOne({ where: { token } });
}

async function ensureInvitationForPublic(ctx: Context, strapi: any, token: string, iin: string) {
  const item = await findByToken(strapi, token);
  if (!item) ctx.throw(404, 'Приглашение не найдено');
  if (isExpired(item) && item.status !== 'EXPIRED') {
    await strapi.entityService.update(INVITATION_UID, item.id, {
      data: { status: 'EXPIRED', history: appendHistory(item, 'expired', 'Срок приглашения истек') },
    } as any);
    ctx.throw(410, 'Срок приглашения истек. Обратитесь в отдел кадров.');
  }
  if (item.status === 'BLOCKED') ctx.throw(423, 'Приглашение заблокировано после неверных попыток. Обратитесь в отдел кадров.');
  if (item.status === 'EXPIRED') ctx.throw(410, 'Срок приглашения истек. Обратитесь в отдел кадров.');
  if (normalizeIin(item.iin) !== normalizeIin(iin)) ctx.throw(403, 'ИИН не совпадает с приглашением');
  return item;
}

export default {
  async publicSettings(ctx: Context) {
    const strapi = (global as any).strapi;
    const invitation = await findByToken(strapi, cleanString(ctx.params.token));
    if (!invitation) ctx.throw(404, 'Приглашение не найдено');
    if (isExpired(invitation) || invitation.status === 'EXPIRED') ctx.throw(410, 'Срок приглашения истек');
    ctx.body = { data: await getOnboardingSettings(strapi) };
  },

  async settings(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can view onboarding settings');
    ctx.body = { data: await getOnboardingSettings(strapi) };
  },

  async updateSettings(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (user?.isSuperAdmin !== true) ctx.throw(403, 'Only SuperAdmin can update onboarding settings');
    const config = normalizeOnboardingSettings((ctx.request.body as any)?.config ?? ctx.request.body);
    const existing = await strapi.db.query(SETTINGS_UID).findOne({});
    if (existing) {
      await strapi.entityService.update(SETTINGS_UID, existing.id, { data: { config } } as any);
    } else {
      await strapi.entityService.create(SETTINGS_UID, { data: { config } } as any);
    }
    ctx.body = { data: config };
  },

  async publicStatus(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const item = await findByToken(strapi, token);
    if (!item) ctx.throw(404, 'Приглашение не найдено');
    if (isExpired(item) && item.status !== 'EXPIRED') {
      const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
        data: { status: 'EXPIRED', history: appendHistory(item, 'expired', 'Срок приглашения истек') },
      } as any);
      ctx.body = { data: safePublicInvitation(updated) };
      return;
    }
    ctx.body = { data: safePublicInvitation(item) };
  },

  async positions(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const invitation = await findByToken(strapi, token);
    if (!invitation) ctx.throw(404, 'Приглашение не найдено');
    if (isExpired(invitation) || invitation.status === 'EXPIRED') {
      ctx.throw(410, 'Срок приглашения истек. Обратитесь в отдел кадров.');
    }

    const cards = await strapi.db.query(EMPLOYEE_CARD_UID).findMany({
      where: { active: true },
      select: ['workplaces'],
      limit: 10000,
    });
    const positions = new Set<string>();
    for (const card of cards || []) {
      for (const workplace of Array.isArray(card?.workplaces) ? card.workplaces : []) {
        const position = cleanString(workplace?.position);
        if (position) positions.add(position);
      }
    }
    ctx.body = { data: Array.from(positions).sort((left, right) => left.localeCompare(right, 'ru')) };
  },

  async verify(ctx: Context) {
    const strapi = (global as any).strapi;
    const body = ctx.request.body || {};
    const token = cleanString(body.token || ctx.params.token);
    const iin = normalizeIin(body.iin);
    if (!token) ctx.throw(400, 'token is required');
    if (!/^\d{12}$/.test(iin)) ctx.throw(400, 'ИИН должен состоять из 12 цифр');

    const item = await findByToken(strapi, token);
    if (!item) ctx.throw(404, 'Приглашение не найдено');
    if (isExpired(item)) {
      const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
        data: { status: 'EXPIRED', history: appendHistory(item, 'expired', 'Срок приглашения истек') },
      } as any);
      ctx.body = { data: safePublicInvitation(updated) };
      return;
    }
    if (item.status === 'BLOCKED') ctx.throw(423, 'Приглашение заблокировано. Обратитесь в отдел кадров.');

    if (normalizeIin(item.iin) !== iin) {
      const attemptsLeft = Math.max(Number(item.attemptsLeft || 0) - 1, 0);
      const status = attemptsLeft <= 0 ? 'BLOCKED' : item.status;
      await strapi.entityService.update(INVITATION_UID, item.id, {
        data: {
          attemptsLeft,
          status,
          history: appendHistory(item, 'wrong_iin', attemptsLeft <= 0 ? 'ИИН введен неверно, приглашение заблокировано' : 'ИИН введен неверно'),
        },
      } as any);
      ctx.throw(attemptsLeft <= 0 ? 423 : 403, attemptsLeft <= 0 ? 'Приглашение заблокировано после 3 неверных попыток' : `ИИН не совпадает. Осталось попыток: ${attemptsLeft}`);
    }

    const status = item.status === 'CREATED' ? 'OPENED' : item.status;
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status,
        history: item.status === 'CREATED' ? appendHistory(item, 'opened', 'Сотрудник открыл приглашение') : item.history || [],
      },
    } as any);
    ctx.body = { data: safePublicInvitation(updated, true) };
  },

  async saveDraft(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const body = ctx.request.body || {};
    const iin = normalizeIin(body.iin);
    const item = await ensureInvitationForPublic(ctx, strapi, token, iin);
    if (item.status === 'SUBMITTED' || item.status === 'APPROVED' || item.status === 'SENT_ONEC') {
      ctx.throw(400, 'Анкета уже отправлена и недоступна для редактирования');
    }

    const draft = {
      ...(item.draft || {}),
      ...(body.draft || {}),
      currentStep: body.currentStep ?? body.draft?.currentStep ?? item.draft?.currentStep ?? 0,
      lastSavedAt: new Date().toISOString(),
    };
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        draft,
        status: item.status === 'RETURNED' ? 'RETURNED' : 'DRAFT',
      },
    } as any);
    ctx.body = { data: safePublicInvitation(updated, true) };
  },

  async uploadFiles(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const iin = normalizeIin((ctx.request.body as any)?.iin);
    const invitation = await ensureInvitationForPublic(ctx, strapi, token, iin);
    if (['SUBMITTED', 'APPROVED', 'SENT_ONEC'].includes(invitation.status)) {
      ctx.throw(400, 'Анкета уже отправлена, загрузка новых файлов недоступна');
    }

    const files = normalizeUploadFiles((ctx.request as any).files);
    if (files.length === 0) ctx.throw(400, 'Выберите файл для загрузки');
    if (files.length > 5) ctx.throw(400, 'За один раз можно загрузить не более 5 файлов');

    const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    for (const file of files) {
      const mime = cleanString(file?.mimetype || file?.type);
      if (!allowedTypes.has(mime)) ctx.throw(400, 'Разрешены только PDF, PNG и JPG файлы');
      if (Number(file?.size || 0) > 25 * 1024 * 1024) ctx.throw(400, 'Размер одного файла не должен превышать 25 МБ');
    }

    const uploaded = await strapi.plugin('upload').service('upload').upload({
      data: {},
      files: files.length === 1 ? files[0] : files,
    });
    const normalized = (Array.isArray(uploaded) ? uploaded : [uploaded]).map((file: any) => ({
      id: file.id,
      name: file.name,
      url: absoluteFileUrl(file.url),
      mime: file.mime,
      type: file.mime,
      size: file.size,
    }));
    ctx.body = { data: normalized };
  },

  async submit(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const body = ctx.request.body || {};
    const iin = normalizeIin(body.iin);
    const item = await ensureInvitationForPublic(ctx, strapi, token, iin);
    const draft = item.draft || {};
    const settings = await getOnboardingSettings(strapi);
    const validationErrors = validateSubmissionDraft(draft, settings);
    if (validationErrors.length > 0) ctx.throw(400, validationErrors[0], { details: { errors: validationErrors } });

    const now = new Date().toISOString();
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        applicationGeneratedAt: now,
        history: appendHistory(item, 'submitted', 'Анкета отправлена в отдел кадров', 'new-employee'),
      },
    } as any);
    ctx.body = { data: safePublicInvitation(updated, true) };
  },

  async list(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can manage new employee onboarding');

    const items = await strapi.entityService.findMany(INVITATION_UID, {
      sort: { createdAt: 'desc' },
      limit: 200,
    } as any);
    ctx.body = { data: (items || []).map(safeInvitation) };
  },

  async createInvitation(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can create onboarding invitations');

    const body = ctx.request.body || {};
    const iin = normalizeIin(body.iin);
    const phone = normalizePhone(body.phone);
    if (!/^\d{12}$/.test(iin)) ctx.throw(400, 'ИИН должен состоять из 12 цифр');
    if (!/^7\d{10}$/.test(phone)) ctx.throw(400, 'Телефон должен быть в формате Казахстана: +7XXXXXXXXXX');

    const token = makeToken();
    const item = await strapi.entityService.create(INVITATION_UID, {
      data: {
        token,
        iin,
        phone,
        status: 'CREATED',
        expiresAt: addDays(new Date(), INVITATION_DAYS),
        attemptsLeft: MAX_ATTEMPTS,
        draft: {},
        returnedSections: [],
        history: [
          {
            at: new Date().toISOString(),
            by: userDisplayName(user),
            action: 'created',
            label: 'HR создал приглашение нового сотрудника',
          },
        ],
      },
    } as any);
    ctx.body = { data: safeInvitation(item) };
  },

  async extend(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can extend onboarding invitations');
    const item = await strapi.entityService.findOne(INVITATION_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'Invitation not found');
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status: item.status === 'EXPIRED' ? 'CREATED' : item.status,
        expiresAt: addDays(new Date(), INVITATION_DAYS),
        history: appendHistory(item, 'extended', 'HR продлил приглашение на 3 дня', userDisplayName(user)),
      },
    } as any);
    ctx.body = { data: safeInvitation(updated) };
  },

  async unblock(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can unblock onboarding invitations');
    const item = await strapi.entityService.findOne(INVITATION_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'Invitation not found');
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status: item.status === 'BLOCKED' ? 'CREATED' : item.status,
        attemptsLeft: MAX_ATTEMPTS,
        history: appendHistory(item, 'unblocked', 'HR разблокировал приглашение и выдал 3 попытки', userDisplayName(user)),
      },
    } as any);
    ctx.body = { data: safeInvitation(updated) };
  },

  async returnForCorrection(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can return onboarding forms');
    const item = await strapi.entityService.findOne(INVITATION_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'Invitation not found');
    const body = ctx.request.body || {};
    const sections = Array.isArray(body.sections) ? body.sections.map(cleanString).filter(Boolean) : [];
    const comment = cleanString(body.comment);
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status: 'RETURNED',
        returnedSections: sections,
        hrComment: comment,
        history: appendHistory(item, 'returned', `HR вернул анкету на корректировку: ${sections.join(', ') || 'разделы не указаны'}`, userDisplayName(user)),
      },
    } as any);
    ctx.body = { data: safeInvitation(updated) };
  },

  async approve(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can approve onboarding forms');
    const item = await strapi.entityService.findOne(INVITATION_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'Invitation not found');
    const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
      data: {
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
        history: appendHistory(item, 'approved', 'HR утвердил анкету нового сотрудника', userDisplayName(user)),
      },
    } as any);
    ctx.body = { data: safeInvitation(updated) };
  },

  async sendToOneC(ctx: Context) {
    const strapi = (global as any).strapi;
    const user = await loadCurrentUser(ctx, strapi);
    if (!canManageOnboarding(user)) ctx.throw(403, 'Only HR or SuperAdmin can send onboarding forms to 1C');
    const item = await strapi.entityService.findOne(INVITATION_UID, ctx.params.id);
    if (!item) ctx.throw(404, 'Invitation not found');
    if (item.status !== 'APPROVED' && item.status !== 'ONEC_ERROR') {
      ctx.throw(400, 'Перед передачей в 1С анкета должна быть утверждена HR');
    }

    const payload = {
      source: 'NNMC corporate onboarding',
      iin: item.iin,
      phone: item.phone,
      draft: item.draft || {},
      filesNote: 'Файлы хранятся в корпоративной системе/MinIO. В 1С передается структурированная анкета и ссылка на личное дело.',
    };
    const endpoint = cleanString(process.env.ONEC_ONBOARDING_URL);

    if (!endpoint) {
      const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
        data: {
          status: 'SENT_ONEC',
          sentToOnecAt: new Date().toISOString(),
          oneCStatus: 'stubbed',
          oneCResponse: { payload, message: 'ONEC_ONBOARDING_URL is not configured; marked as sent for workflow testing' },
          history: appendHistory(item, 'sent_to_1c_stub', 'Анкета отмечена как переданная в 1С (тестовый режим)', userDisplayName(user)),
        },
      } as any);
      ctx.body = { data: safeInvitation(updated) };
      return;
    }

    try {
      const username = cleanString(process.env.ONEC_API_USER);
      const password = String(process.env.ONEC_API_PASSWORD || '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (username || password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(parsed?.message || parsed?.error || `1C returned HTTP ${response.status}`);
      const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
        data: {
          status: 'SENT_ONEC',
          sentToOnecAt: new Date().toISOString(),
          oneCStatus: 'sent',
          oneCResponse: parsed,
          history: appendHistory(item, 'sent_to_1c', 'Анкета передана в 1С', userDisplayName(user)),
        },
      } as any);
      ctx.body = { data: safeInvitation(updated) };
    } catch (error: any) {
      const updated = await strapi.entityService.update(INVITATION_UID, item.id, {
        data: {
          status: 'ONEC_ERROR',
          oneCStatus: 'error',
          oneCResponse: { message: error?.message || String(error) },
          history: appendHistory(item, 'onec_error', 'Ошибка передачи анкеты в 1С', userDisplayName(user)),
        },
      } as any);
      ctx.throw(502, updated.oneCResponse?.message || '1C integration failed');
    }
  },
};
