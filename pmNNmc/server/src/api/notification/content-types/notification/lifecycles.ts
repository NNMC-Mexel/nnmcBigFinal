import { sendPushToUser } from '../../../../push/fcm';

declare const strapi: any;

// Send a mobile push whenever an in-app notification is created — this single
// hook covers every place that creates notifications (tickets, protocols, etc.).
export default {
  async afterCreate(event: any) {
    try {
      const result = event?.result;
      if (!result) return;

      let recipientId = result.recipient?.id ?? result.recipient;
      if (!recipientId) {
        const full = await strapi.db
          .query('api::notification.notification')
          .findOne({ where: { id: result.id }, populate: ['recipient'] });
        recipientId = full?.recipient?.id;
      }
      if (!recipientId) return;

      await sendPushToUser(recipientId, {
        title: result.title || 'NNMC Portal',
        body: result.body || '',
        data: {
          link: String(result.link || ''),
          type: String(result.type || ''),
        },
      });
    } catch (e: any) {
      strapi.log?.warn?.('[push] notification afterCreate failed: ' + (e?.message || e));
    }
  },
};
