export default {
    routes: [
        {
            method: "GET",
            path: "/documents/:id/file-url",
            handler: "api::document.document.getFileUrl",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/:id/presign",
            handler: "api::document.document.presignUrl",
            config: { policies: [], middlewares: [] },
        },
    ],
};
