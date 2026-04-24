import { factories } from "@strapi/strapi";

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        async create(ctx) {
            const body = ctx.request.body;
            const data = (body as any)?.data || {};

            const toFileId = async (ref: any): Promise<number | null> => {
                if (ref == null) return null;
                if (typeof ref === "number") return ref;
                if (typeof ref === "string" && /^\d+$/.test(ref)) return Number(ref);
                if (typeof ref === "string") {
                    const f = await strapi.db
                        .query("plugin::upload.file")
                        .findOne({ where: { documentId: ref } });
                    return f?.id ?? null;
                }
                if (typeof ref === "object") {
                    if (ref.id != null) return Number(ref.id);
                    if (ref.documentId) {
                        const f = await strapi.db
                            .query("plugin::upload.file")
                            .findOne({ where: { documentId: ref.documentId } });
                        return f?.id ?? null;
                    }
                }
                return null;
            };

            const currentFileId = await toFileId(data.currentFile);
            const originalFileId = await toFileId(data.originalFile);

            delete data.currentFile;
            delete data.originalFile;

            const result: any = await (super.create as any)(ctx);

            const created = result?.data || result;
            const docNumericId = created?.id;

            // Strapi V5 REST media-relation resolver is broken for numeric ids:
            // POST /api/documents with `currentFile: 42` (numeric) silently links
            // a different file. Workaround: strip media from body, then attach
            // files manually via the polymorphic `file.related` field.
            if (docNumericId) {
                const sameFile = currentFileId && originalFileId === currentFileId;
                if (sameFile) {
                    await strapi.db.query("plugin::upload.file").update({
                        where: { id: currentFileId },
                        data: {
                            related: [
                                { id: docNumericId, __type: "api::document.document", __pivot: { field: "currentFile" } },
                                { id: docNumericId, __type: "api::document.document", __pivot: { field: "originalFile" } },
                            ],
                        },
                    });
                } else {
                    if (currentFileId) {
                        await strapi.db.query("plugin::upload.file").update({
                            where: { id: currentFileId },
                            data: {
                                related: [
                                    { id: docNumericId, __type: "api::document.document", __pivot: { field: "currentFile" } },
                                ],
                            },
                        });
                    }
                    if (originalFileId) {
                        await strapi.db.query("plugin::upload.file").update({
                            where: { id: originalFileId },
                            data: {
                                related: [
                                    { id: docNumericId, __type: "api::document.document", __pivot: { field: "originalFile" } },
                                ],
                            },
                        });
                    }
                }
            }

            return result;
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

            const url = (file as any).url;
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
