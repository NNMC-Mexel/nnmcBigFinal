export default ({ env }) => ({
  upload: {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        baseUrl: env('MINIO_PUBLIC_URL') || `${env('MINIO_ENDPOINT', '')}/${env('MINIO_BUCKET', '')}`,
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
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
      jwt: {
        expiresIn: '7d',
      },
      providers: {
        keycloak: {
          enabled: env.bool('KEYCLOAK_ENABLED', false),
          icon: 'key',
          key: env('KEYCLOAK_CLIENT_ID', ''),
          secret: env('KEYCLOAK_CLIENT_SECRET', ''),
          callback: `${env('SERVER_URL', 'http://192.168.101.25:12015')}/api/auth/keycloak/callback`,
          scope: ['openid', 'profile', 'email'],
          authorize_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/auth`,
          access_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/token`,
          profile_url: `${env('KEYCLOAK_URL', '')}/realms/${env('KEYCLOAK_REALM', 'nnmc')}/protocol/openid-connect/userinfo`,
        },
      },
    },
  },
});
