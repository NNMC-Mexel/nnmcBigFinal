export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');
  const extraOrigins = env.array('CORS_EXTRA_ORIGINS', []);
  const minioEndpoint = env('MINIO_ENDPOINT', '');
  const minioOrigin = minioEndpoint ? new URL(minioEndpoint).origin : '';

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
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', minioOrigin].filter(Boolean),
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', minioOrigin].filter(Boolean),
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
        formidable: {
          maxFileSize: 25 * 1024 * 1024,
          multiples: true,
        },
      },
    },
    {
      name: 'strapi::session',
      config: {
        secure: false,
      },
    },
    'strapi::favicon',
    ...(minioEndpoint ? ['global::minio-proxy'] : []),
    'strapi::public',
  ];
};
