export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '7d',
      },
      providers: {
        keycloak: {
          enabled: env.bool('KEYCLOAK_ENABLED', false),
          icon: 'key',
          key: env('KEYCLOAK_CLIENT_ID', ''),
          secret: env('KEYCLOAK_CLIENT_SECRET', ''),
          callback: `${env('SERVER_URL', 'http://192.168.101.25:12011')}/api/auth/keycloak/callback`,
          scope: ['openid', 'profile', 'email'],
          authorize_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/auth`,
          access_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/token`,
          profile_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/userinfo`,
        },
      },
    },
  },
});
