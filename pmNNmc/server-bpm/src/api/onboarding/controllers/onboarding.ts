import crypto from 'crypto';
import type { Context } from 'koa';

const INVITATION_UID = 'api::onboarding-invitation.onboarding-invitation' as any;
const USER_UID = 'plugin::users-permissions.user' as any;
const INVITATION_DAYS = 3;
const MAX_ATTEMPTS = 3;

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

  async submit(ctx: Context) {
    const strapi = (global as any).strapi;
    const token = cleanString(ctx.params.token);
    const body = ctx.request.body || {};
    const iin = normalizeIin(body.iin);
    const item = await ensureInvitationForPublic(ctx, strapi, token, iin);
    const draft = item.draft || {};
    const safety = draft.safety || {};
    if (!safety.introReviewed || !safety.hospitalSafetyReviewed) {
      ctx.throw(400, 'Перед отправкой нужно отметить просмотр двух видео по безопасности');
    }

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
