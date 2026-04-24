import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        async create(ctx) {
            const body = ctx.request.body;
            const data = (body as any)?.data || {};

            const toDocumentId = async (ref: any): Promise<string | null> => {
                if (ref == null) return null;
                let file: any = null;
                if (typeof ref === "number" || (typeof ref === "string" && /^\d+$/.test(ref))) {
                    file = await strapi.db
                        .query("plugin::upload.file")
                        .findOne({ where: { id: Number(ref) } });
                } else if (typeof ref === "string") {
                    return ref;
                } else if (typeof ref === "object") {
                    if (ref.documentId) return ref.documentId;
                    if (ref.id != null) {
                        file = await strapi.db
                            .query("plugin::upload.file")
                            .findOne({ where: { id: Number(ref.id) } });
                    }
                }
                return file?.documentId ?? null;
            };

            if (data.currentFile != null) {
                const docId = await toDocumentId(data.currentFile);
                if (docId) data.currentFile = docId;
            }
            if (data.originalFile != null) {
                const docId = await toDocumentId(data.originalFile);
                if (docId) data.originalFile = docId;
            }

            console.log(
                `[doc-create-debug] body.currentFile=${data.currentFile} body.originalFile=${data.originalFile}`
            );

            return await (super.create as any)(ctx);
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
