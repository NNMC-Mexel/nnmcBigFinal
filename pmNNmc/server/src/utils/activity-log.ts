export const getRequestUserId = (strapi: any): number | null => {
  try {
    const ctx = strapi.requestContext?.get?.();
    return ctx?.state?.user?.id ?? null;
  } catch {
    return null;
  }
};
