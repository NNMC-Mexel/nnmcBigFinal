export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 12016),
  url: env('PUBLIC_URL', ''),
  app: {
    keys: env.array('APP_KEYS', ['bpm-key-1', 'bpm-key-2']),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
