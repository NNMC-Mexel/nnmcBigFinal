import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        async create(ctx) {
            const body = ctx.request.body;
            const data = (body as any)?.data || {};

            const resolveFileRecord = async (ref: any) => {
                if (ref == null) return null;
                let file: any = null;
                if (typeof ref === "number" || (typeof ref === "string" && /^\d+$/.test(ref))) {
                    file = await strapi.db
                        .query("plugin::upload.file")
                        .findOne({ where: { id: Number(ref) } });
                } else if (typeof ref === "string") {
                    file = await strapi.db
                        .query("plugin::upload.file")
                        .findOne({ where: { documentId: ref } });
                } else if (typeof ref === "object") {
                    if (ref.id != null) {
                        file = await strapi.db
                            .query("plugin::upload.file")
                            .findOne({ where: { id: Number(ref.id) } });
                    } else if (ref.documentId) {
                        file = await strapi.db
                            .query("plugin::upload.file")
                            .findOne({ where: { documentId: ref.documentId } });
                    }
                }
                return file;
            };

            const currentFile = await resolveFileRecord(data.currentFile);
            const originalFile = await resolveFileRecord(data.originalFile);

            console.log(
                `[doc-create-debug] resolved currentFile.id=${currentFile?.id} hash=${currentFile?.hash}; originalFile.id=${originalFile?.id} hash=${originalFile?.hash}`
            );

            const cleanData = { ...data };
            delete cleanData.currentFile;
            delete cleanData.originalFile;

            const created = (await strapi.documents("api::document.document").create({
                data: {
                    ...cleanData,
                    ...(currentFile && { currentFile: currentFile.documentId }),
                    ...(originalFile && { originalFile: originalFile.documentId }),
                },
                populate: {
                    currentFile: true,
                    originalFile: true,
                    creator: true,
                    assigned_users: true,
                    documentType: true,
                    subdivision: true,
                },
            })) as any;

            console.log(
                `[doc-create-debug] created docId=${created?.documentId} currentFile.id=${created?.currentFile?.id} currentFile.hash=${created?.currentFile?.hash}`
            );

            return { data: created };
        },
        /**
         * GET /api/documents/:id/file-url?file=current|original
         * Returns the public URL for the document's file.
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

            const f = file as any;
            console.log(
                `[file-url-debug] doc=${id} fileType=${fileType} file.id=${f?.id} file.documentId=${f?.documentId} file.hash=${f?.hash} file.url=${f?.url}`
            );

            const url = f.url;
            return ctx.send({ url });
        },

        /**
         * GET /api/documents/:id/presign?key=<objectKey>
         * Returns the file URL for a given key.
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

            // For local storage, construct the URL from the key
            const url = `/uploads/${key}`;
            return ctx.send({ url });
        },
    })
);
