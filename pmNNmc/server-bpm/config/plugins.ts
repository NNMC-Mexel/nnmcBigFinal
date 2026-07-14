export default ({ env }) => {
  const useMinio = Boolean(env('MINIO_ENDPOINT', '') && env('MINIO_BUCKET', ''));

  return {
    ...(useMinio
      ? {
          upload: {
            config: {
              provider: 'aws-s3',
              providerOptions: {
                baseUrl: env('MINIO_PUBLIC_URL') || `${env('SERVER_URL', '')}/uploads`,
                rootPath: env('MINIO_ROOT_PATH', ''),
                s3Options: {
                  endpoint: env('MINIO_ENDPOINT'),
                  region: env('MINIO_REGION', 'us-east-1'),
                  credentials: {
                    accessKeyId: env('MINIO_ACCESS_KEY'),
                    secretAccessKey: env('MINIO_SECRET_KEY'),
                  },
                  forcePathStyle: true,
                  params: { Bucket: env('MINIO_BUCKET') },
                },
              },
              actionOptions: {
                upload: {},
                uploadStream: {},
                delete: {},
              },
            },
          },
        }
      : {}),
    'users-permissions': {
    config: {
      ratelimit: {
        max: 100,
        interval: 60 * 1000,
      },
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
          callback: `${env('SERVER_URL', 'http://localhost:12016')}/api/auth/keycloak/callback`,
          scope: ['openid', 'profile', 'email'],
          authorize_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/auth`,
          access_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/token`,
          profile_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/userinfo`,
        },
      },
    },
    },
  };
};
