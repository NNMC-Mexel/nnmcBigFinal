export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'nnmc-admin-jwt-secret-key-2024'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'nnmc-api-token-salt-2024'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'nnmc-transfer-token-salt-2024'),
    },
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});
