import type { Context } from 'koa';

declare const strapi: any;

const MAX_LEN = 4000;

async function sendTelegram(token: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
  }
}

function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default {
  async send(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const body = (ctx.request.body as any)?.data || (ctx.request.body as any) || {};
    const message = String(body.message || '').trim();
    if (!message) return ctx.badRequest('Сообщение пустое');
    if (message.length > MAX_LEN) return ctx.badRequest(`Максимум ${MAX_LEN} символов`);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID;
    if (!token || !chatId) {
      strapi.log.error('[feedback] TELEGRAM_BOT_TOKEN or TELEGRAM_FEEDBACK_CHAT_ID is not set');
      return ctx.internalServerError('Telegram не настроен');
    }

    const fullUser = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: user.id }, populate: ['department'] });

    const author =
      `<b>${escapeHtml(fullUser?.fullName || fullUser?.username || 'unknown')}</b>` +
      (fullUser?.email ? ` (${escapeHtml(fullUser.email)})` : '');
    const dept = fullUser?.department?.name
      ? `\nОтдел: ${escapeHtml(fullUser.department.name)}`
      : '';
    const page = body.page ? `\nСтраница: ${escapeHtml(String(body.page))}` : '';
    const text = `💡 <b>Предложение</b>\nОт: ${author}${dept}${page}\n\n${escapeHtml(message)}`;

    try {
      await sendTelegram(token, chatId, text);
    } catch (e: any) {
      strapi.log.error(`[feedback] telegram failed: ${e?.message || e}`);
      return ctx.internalServerError('Не удалось отправить, попробуйте позже');
    }

    ctx.body = { ok: true };
  },
};
