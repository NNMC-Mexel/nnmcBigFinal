export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');

  const s3PublicUrl = env('S3_PUBLIC_URL');
  const s3Endpoint = env('S3_ENDPOINT');
  const s3Hosts = [s3PublicUrl, s3Endpoint].filter(Boolean);

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:', ...s3Hosts],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...s3Hosts],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...s3Hosts],
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
