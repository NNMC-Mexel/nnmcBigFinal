module.exports = ({ env }) => ({
    // Upload: use local storage by default, S3/MinIO when configured
    ...(env("MINIO_ENDPOINT")
        ? {
              upload: {
                  config: {
                      provider: "aws-s3",
                      providerOptions: {
                          s3Options: {
                              credentials: {
                                  accessKeyId: env("MINIO_ACCESS_KEY"),
                                  secretAccessKey: env("MINIO_SECRET_KEY"),
                              },
                              region: "us-east-1",
                              endpoint: env("MINIO_ENDPOINT"),
                              forcePathStyle: true,
                              params: {
                                  Bucket: env("MINIO_BUCKET"),
                              },
                          },
                      },
                  },
              },
          }
        : {}),
});
