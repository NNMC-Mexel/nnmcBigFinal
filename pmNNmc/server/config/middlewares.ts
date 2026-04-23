export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');
  const devPorts = [...Array.from({ length: 9 }, (_, i) => 5171 + i), 13005, 13010];
  const devOrigins = devPorts.flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://192.168.101.25:${port}`,
  ]);

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
          ...devOrigins,
          'http://localhost:1337',
          'http://127.0.0.1:1337',
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
    'global::minio-proxy',
    'strapi::public',
  ];
};
