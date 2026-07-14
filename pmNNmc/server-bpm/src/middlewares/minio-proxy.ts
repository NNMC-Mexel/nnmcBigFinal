import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
    if ((ctx.method !== 'GET' && ctx.method !== 'HEAD') || !ctx.path.startsWith('/uploads/')) {
      return next();
    }

    const key = decodeURIComponent(ctx.path.substring('/uploads/'.length));
    const bucket = process.env.MINIO_BUCKET;
    if (!key || !bucket) return next();

    try {
      const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (result.ContentType) ctx.set('Content-Type', result.ContentType);
      if (result.ContentLength !== undefined) ctx.set('Content-Length', String(result.ContentLength));
      if (result.ETag) ctx.set('ETag', result.ETag);
      ctx.set('Cache-Control', 'private, max-age=3600');
      ctx.status = 200;
      if (ctx.method !== 'HEAD') ctx.body = result.Body as Readable;
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        ctx.status = 404;
        return;
      }
      strapi.log.error(`MinIO proxy error for ${key}: ${error?.message || error}`);
      ctx.status = 502;
    }
  };
};
