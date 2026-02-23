export default (plugin) => {
  // Extend the me controller to include role
  const originalMe = plugin.controllers.user.me;

  plugin.controllers.user.me = async (ctx) => {
    // Call original me
    await originalMe(ctx);

    if (ctx.body && ctx.state.user) {
      // Fetch user with role populated
      const user = await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        ctx.state.user.id,
        {
          populate: ['role', 'department'],
        }
      );

      if (user) {
        ctx.body = user;
      }
    }
  };

  return plugin;
};
