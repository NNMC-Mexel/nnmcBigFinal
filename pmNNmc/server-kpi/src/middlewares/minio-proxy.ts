import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

export default (_config: unknown, { strapi }: { strapi: any }) => {
  let client: S3Client | null = null;

  const getClient = () => {
    if (!client) {
      client = new S3Client({
        endpoint: process.env.MINIO_ENDPOINT,
        region: process.env.MINIO_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || '',
          secretAccessKey: process.env.MINIO_SECRET_KEY || '',
        },
        forcePathStyle: true,
      });
    }
    return client;
  };

  return async (ctx: any, next: any) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      return next();
    }
    if (!ctx.path.startsWith('/uploads/')) {
      return next();
    }

    const key = decodeURIComponent(ctx.path.substring('/uploads/'.length));
    if (!key) return next();

    const bucket = process.env.MINIO_BUCKET;
    if (!bucket) {
      strapi.log.error('MINIO_BUCKET env var is not set — cannot proxy /uploads');
      ctx.status = 500;
      return;
    }

    try {
      const result = await getClient().send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      if (result.ContentType) ctx.set('Content-Type', result.ContentType);
      if (result.ContentLength !== undefined) {
        ctx.set('Content-Length', String(result.ContentLength));
      }
      if (result.ETag) ctx.set('ETag', result.ETag);
      ctx.set('Cache-Control', 'public, max-age=31536000, immutable');

      ctx.status = 200;
      ctx.body = result.Body as Readable;
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        ctx.status = 404;
        return;
      }
      strapi.log.error(`MinIO proxy error for ${key}:`, err?.message || err);
      ctx.status = 502;
    }
  };
};
