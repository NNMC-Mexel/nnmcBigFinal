export default ({ env }) => {
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
            'frame-ancestors': ["'self'", 'http://192.168.101.25:13010', 'http://localhost:13010', 'http://localhost:13005'],
            'connect-src': ["'self'", 'https:', 'http:', ...minioHosts],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...minioHosts],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...minioHosts],
          },
        },
        frameguard: false,
      },
    },
    {
      name: 'strapi::cors',
      config: {
        origin: ['*'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
        keepHeaderOnError: true,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'global::minio-proxy',
    'strapi::public',
  ];
};
