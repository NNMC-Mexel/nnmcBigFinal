export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '7d',
      },
      register: {
        allowedFields: ['firstName', 'lastName', 'department'],
      },
      providers: {
        keycloak: {
          enabled: env.bool('KEYCLOAK_ENABLED', false),
          icon: 'key',
          key: env('KEYCLOAK_CLIENT_ID', ''),
          secret: env('KEYCLOAK_CLIENT_SECRET', ''),
          callback: `${env('SERVER_URL', 'http://192.168.46.222:12005')}/api/auth/keycloak/callback`,
          scope: ['openid', 'profile', 'email'],
          authorize_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/auth`,
          access_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/token`,
          profile_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/userinfo`,
        },
      },
    },
  },
  // Email plugin - раскомментируйте после установки nodemailer
  // npm install nodemailer @strapi/provider-email-nodemailer
  // email: {
  //   config: {
  //     provider: 'nodemailer',
  //     providerOptions: {
  //       host: env('SMTP_HOST', 'smtp.gmail.com'),
  //       port: env.int('SMTP_PORT', 587),
  //       auth: {
  //         user: env('SMTP_USER'),
  //         pass: env('SMTP_PASS'),
  //       },
  //     },
  //     settings: {
  //       defaultFrom: env('SMTP_FROM', 'noreply@nnmc.kz'),
  //       defaultReplyTo: env('SMTP_REPLY_TO', 'support@nnmc.kz'),
  //     },
  //   },
  // },
});
