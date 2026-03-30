import { factories } from "@strapi/strapi";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const makeS3Client = () =>
    new S3Client({
        credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY!,
            secretAccessKey: process.env.MINIO_SECRET_KEY!,
        },
        region: "us-east-1",
        endpoint: process.env.MINIO_ENDPOINT,
        forcePathStyle: true,
    });

const checkMinioEnv = (ctx: any) => {
    if (
        !process.env.MINIO_ENDPOINT ||
        !process.env.MINIO_BUCKET ||
        !process.env.MINIO_ACCESS_KEY ||
        !process.env.MINIO_SECRET_KEY
    ) {
        ctx.internalServerError("MinIO не настроен");
        return false;
    }
    return true;
};

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        /**
         * GET /api/documents/:id/file-url?file=current|original
         * Returns a pre-signed MinIO URL for the document's main file (15 min TTL).
         * Accessible only to the document creator or assigned users.
         */
        async getFileUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const fileType = (ctx.query.file as string) || "current";

            const document = await strapi
                .documents("api::document.document")
                .findOne({
                    documentId: id,
                    populate: [
                        "currentFile",
                        "originalFile",
                        "creator",
                        "assigned_users",
                    ],
                });

            if (!document) return ctx.notFound("Документ не найден");

            const isCreator = document.creator?.id === user.id;
            const isAssigned = (document.assigned_users as any[])?.some(
                (u) => u.id === user.id
            );
            if (!isCreator && !isAssigned)
                return ctx.forbidden("Нет доступа к этому документу");

            const file =
                fileType === "original"
                    ? document.originalFile
                    : document.currentFile;

            if (!file) return ctx.notFound("Файл не найден");

            if (!checkMinioEnv(ctx)) return;

            const key = `${file.hash}${file.ext}`;
            const command = new GetObjectCommand({
                Bucket: process.env.MINIO_BUCKET,
                Key: key,
            });

            const signedUrl = await getSignedUrl(makeS3Client(), command, {
                expiresIn: 900,
            });

            return ctx.send({ url: signedUrl });
        },

        /**
         * GET /api/documents/:id/presign?key=<objectKey>
         * Returns a pre-signed MinIO URL for any file associated with a document
         * (e.g. CMS signature files stored in signatureHistory).
         * Accessible only to the document creator or assigned users.
         */
        async presignUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const key = ctx.query.key as string;
            if (!key) return ctx.badRequest("Параметр key обязателен");

            const document = await strapi
                .documents("api::document.document")
                .findOne({
                    documentId: id,
                    populate: ["creator", "assigned_users"],
                });

            if (!document) return ctx.notFound("Документ не найден");

            const isCreator = document.creator?.id === user.id;
            const isAssigned = (document.assigned_users as any[])?.some(
                (u) => u.id === user.id
            );
            if (!isCreator && !isAssigned)
                return ctx.forbidden("Нет доступа к этому документу");

            if (!checkMinioEnv(ctx)) return;

            const command = new GetObjectCommand({
                Bucket: process.env.MINIO_BUCKET,
                Key: key,
            });

            const signedUrl = await getSignedUrl(makeS3Client(), command, {
                expiresIn: 900,
            });

            return ctx.send({ url: signedUrl });
        },
    })
);
