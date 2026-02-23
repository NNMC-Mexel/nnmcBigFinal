export default {
  // createdBy temporarily disabled due to FK constraint issues
  // async beforeCreate(event: any) {
  //   const { data } = event.params;
  //   const ctx = strapi.requestContext.get();
  //   if (ctx?.state?.user && !data.createdBy) {
  //     data.createdBy = ctx.state.user.id;
  //   }
  // },
};
