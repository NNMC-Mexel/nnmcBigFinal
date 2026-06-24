'use strict';

module.exports = {
  register(/* { strapi } */) {},

  async bootstrap({ strapi }) {
    // Auto-configure public permissions for Room and Booking
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (!publicRole) return;

    const permissions = await strapi
      .query('plugin::users-permissions.permission')
      .findMany({ where: { role: publicRole.id } });

    const existingActions = permissions.map((p) => p.action);

    // Public role: read-only access to the room list only.
    // Booking find/findOne/create/delete are NOT public — they expose/modify
    // booking data (bookerName, department, cancelCode) and must require a token.
    const requiredPermissions = [
      'api::room.room.find',
      'api::room.room.findOne',
    ];

    for (const action of requiredPermissions) {
      if (!existingActions.includes(action)) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            action,
            role: publicRole.id,
            enabled: true,
          },
        });
        strapi.log.info(`[bootstrap] Added public permission: ${action}`);
      }
    }

    // Revoke any booking permissions previously granted to the public role
    // (earlier releases exposed unauthenticated create/delete of bookings).
    const publicBookingActions = [
      'api::booking.booking.find',
      'api::booking.booking.findOne',
      'api::booking.booking.create',
      'api::booking.booking.delete',
    ];
    for (const action of publicBookingActions) {
      const removed = await strapi
        .query('plugin::users-permissions.permission')
        .deleteMany({ where: { role: publicRole.id, action } });
      if (removed?.count) {
        strapi.log.info(`[bootstrap] Revoked public permission: ${action}`);
      }
    }

    // Auto-configure authenticated permissions
    const authRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    if (!authRole) return;

    const authPermissions = await strapi
      .query('plugin::users-permissions.permission')
      .findMany({ where: { role: authRole.id } });

    const authExisting = authPermissions.map((p) => p.action);

    const authRequired = [
      'api::room.room.find',
      'api::room.room.findOne',
      'api::booking.booking.find',
      'api::booking.booking.findOne',
      'api::booking.booking.create',
      'api::booking.booking.delete',
    ];

    for (const action of authRequired) {
      if (!authExisting.includes(action)) {
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            action,
            role: authRole.id,
            enabled: true,
          },
        });
        strapi.log.info(`[bootstrap] Added authenticated permission: ${action}`);
      }
    }

    // Enable registration and disable email confirmation
    const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
    const advancedSettings = await pluginStore.get({ key: 'advanced' });
    if (advancedSettings) {
      let needsUpdate = false;
      if (!advancedSettings.allow_register) {
        advancedSettings.allow_register = true;
        needsUpdate = true;
      }
      if (advancedSettings.email_confirmation) {
        advancedSettings.email_confirmation = false;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await pluginStore.set({ key: 'advanced', value: advancedSettings });
        strapi.log.info('[bootstrap] Enabled registration, disabled email confirmation');
      }
    }

    // Seed rooms if none exist
    const roomCount = await strapi.query('api::room.room').count();
    if (roomCount === 0) {
      await strapi.query('api::room.room').create({
        data: { name: 'Зал 1', capacity: 10, description: 'Основной конференц-зал', color: '#3B82F6' },
      });
      await strapi.query('api::room.room').create({
        data: { name: 'Зал 2', capacity: 6, description: 'Малый конференц-зал', color: '#10B981' },
      });
      strapi.log.info('[bootstrap] Created 2 default rooms');
    }
  },

  destroy(/* { strapi } */) {},
};
