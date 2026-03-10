module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 12013),
  app: {
    keys: env.array('APP_KEYS', ['key1_change_me', 'key2_change_me']),
  },
});
