export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');
  const extraOrigins = env.array('CORS_EXTRA_ORIGINS', []);

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:', 'http:'],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io'],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io'],
          },
        },
      },
    },
    {
      name: 'strapi::cors',
      config: {
        enabled: true,
        headers: '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        origin: [
          frontendUrl,
          'http://localhost:13010',
          'http://127.0.0.1:13010',
          'http://192.168.101.25:13010',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          ...extraOrigins,
        ].filter(Boolean),
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    {
      name: 'strapi::body',
      config: {
        formLimit: '64mb',
        jsonLimit: '20mb',
        textLimit: '20mb',
      },
    },
    {
      name: 'strapi::session',
      config: {
        secure: false,
      },
    },
    'strapi::favicon',
    'strapi::public',
  ];
};
