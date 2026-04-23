export default ({ env }) => ({
  upload: {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        baseUrl: env('S3_PUBLIC_URL'),
        rootPath: env('S3_ROOT_PATH', ''),
        s3Options: {
          endpoint: env('S3_ENDPOINT'),
          region: env('S3_REGION', 'us-east-1'),
          credentials: {
            accessKeyId: env('S3_ACCESS_KEY_ID'),
            secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
          },
          forcePathStyle: true,
          params: { Bucket: env('S3_BUCKET') },
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
