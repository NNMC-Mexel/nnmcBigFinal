export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'nnmc-bpm-admin-jwt-secret-key-2026'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'nnmc-bpm-api-token-salt-2026'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'nnmc-bpm-transfer-token-salt-2026'),
    },
  },
  flags: {
    nps: env.bool('FLAG_NPS', false),
    promoteEE: env.bool('FLAG_PROMOTE_EE', false),
  },
});
