export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '7d',
      },
      register: {
        allowedFields: ['firstName', 'lastName', 'department'],
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
