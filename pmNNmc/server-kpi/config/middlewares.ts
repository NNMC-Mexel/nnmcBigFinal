export default ({ env }) => {
  const frontendUrl = env('FRONTEND_URL', 'http://192.168.101.25:13010');

  return [
    'strapi::logger',
    'strapi::errors',
    'strapi::security',
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
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};
