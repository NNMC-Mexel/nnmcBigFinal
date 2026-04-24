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

            console.log(
                `[doc-create-debug] super.create returned id=${docNumericId} currentFileId=${currentFileId} originalFileId=${originalFileId}`
            );

            if (docNumericId) {
                const knex = (strapi.db as any).connection;
                const attach = async (fileId: number, field: string) => {
                    if (!fileId) return;
                    await knex("files_related_morphs").insert({
                        file_id: fileId,
                        related_id: docNumericId,
                        related_type: "api::document.document",
                        field,
                        order: 1,
                    });
                };
                try {
                    await attach(currentFileId!, "currentFile");
                    await attach(originalFileId!, "originalFile");
                    console.log(`[doc-create-debug] morph rows inserted for doc id=${docNumericId}`);
                } catch (e: any) {
                    console.error(`[doc-create-debug] morph insert failed:`, e?.message || e);
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
