export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');

  const minioPublicUrl = env('MINIO_PUBLIC_URL');
  const minioEndpoint = env('MINIO_ENDPOINT');
  const minioHosts = [minioPublicUrl, minioEndpoint].filter(Boolean);

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:', 'http:', ...minioHosts],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...minioHosts],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...minioHosts],
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
          'http://192.168.101.25:13010',
          'http://192.168.101.25:13005',
          'http://localhost:13010',
          'http://localhost:13005',
          'http://localhost:1337',
        ].filter(Boolean),
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
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
