export default {
  async afterCreate(event) {
    const { result } = event;
    
    // Автоматически подтверждаем пользователя при создании
    if (result && !result.confirmed) {
      await strapi.entityService.update('plugin::users-permissions.user', result.id, {
        data: {
          confirmed: true,
        },
      });
    }
  },
  
  async afterUpdate(event) {
    // Можно добавить логику при обновлении, если нужно
  },
};
