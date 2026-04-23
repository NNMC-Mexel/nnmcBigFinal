export default ({ env }) => {
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
            'frame-ancestors': ["'self'", 'http://192.168.101.25:13010', 'http://localhost:13010', 'http://localhost:13005'],
            'connect-src': ["'self'", 'https:', ...s3Hosts],
            'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...s3Hosts],
            'media-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', ...s3Hosts],
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
    'strapi::public',
  ];
};
